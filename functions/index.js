const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({ region: "europe-west3" });

exports.highscoreAlert = onDocumentCreated(
  "highscores/{scoreId}",
  async (event) => {

    if (!event.data) return;

    const data = event.data.data();
    const player = data.name;
    const score = data.score;
    const playerToken = data.token;

    const db = admin.firestore();

    // 🔎 aktuelle Top 10 laden
    const topQuery = await db
      .collection("highscores")
      .orderBy("score", "desc")
      .limit(100)
      .get();

    const topScores = topQuery.docs.map(doc => doc.data().score);

    // ❌ Score nicht gut genug → keine Push
    if (topScores.length === 100 && score < topScores[topScores.length - 1]) {
      console.log("Score not high enough for push");
      return;
    }

    // 🏆 Rang berechnen
    let rank = topScores.findIndex(s => score >= s);

    if (rank === -1) {
      rank = topScores.length;
    }

    let messageBody = `${player} erzielte ${score} Punkte!`;

    if (rank === 0) {
      messageBody = `🔥 NEW RECORD! ${player} erzielte ${score} Punkte!`;
    }
    else if (rank === 1) {
      messageBody = `⚡ Almost Champion! ${player} erzielte ${score} Punkte!`;
    }
    else if (rank === 2) {
      messageBody = `🏆 Top 3! ${player} erzielte ${score} Punkte!`;
    }

    // 📲 alle Tokens laden
    const tokensSnapshot = await db.collection("tokens").get();

    const tokens = [];

    tokensSnapshot.forEach(doc => {
      tokens.push(doc.id);
    });

    if (tokens.length === 0) {
      console.log("No tokens found");
      return;
    }

    // 📤 Leaderboard Push
    const message = {
      data: {
        title: "🐍NEON SNAKE🐍",
        body: messageBody
      },
      tokens: tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log("Push sent:", response.successCount, "/", tokens.length);

    // 🧹 ungültige Tokens entfernen
    response.responses.forEach((resp, idx) => {

      if (!resp.success) {

        const error = resp.error.code;

        if (
          error === "messaging/registration-token-not-registered" ||
          error === "messaging/invalid-registration-token"
        ) {

          const badToken = tokens[idx];

          console.log("Removing invalid token:", badToken);

          db.collection("tokens")
            .doc(badToken)
            .delete();
        }
      }

    });

    // ⚔️ Rival System
    // Spieler benachrichtigen, deren Score geschlagen wurde

    const beatenQuery = await db
      .collection("highscores")
      .where("score", "<", score)
      .orderBy("score", "desc") // 🔥 wichtig! damit nur die spieler informiert werden die gerade überholt wurden
      .limit(3)
      .get();

    const rivalTokens = [];

    beatenQuery.forEach(doc => {

      const rival = doc.data();

      if (rival.token && rival.token !== playerToken) {
        rivalTokens.push(rival.token);
      }

    });

    if (rivalTokens.length > 0) {

      const rivalMessage = {
        data: {
          title: "⚠️ Dein Score wurde geschlagen!",
          body: `${player} hat dich mit ${score} Punkten überholt!`
        },
        tokens: rivalTokens
      };

      await admin.messaging().sendEachForMulticast(rivalMessage);

      console.log("Rival notifications sent:", rivalTokens.length);

    }

  }
);