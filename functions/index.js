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

        if (score < 50) {
            console.log("Score too low for push");
            return;
        }

        const db = admin.firestore();
        const tokensSnapshot = await db.collection("tokens").get();

        const tokens = [];

        tokensSnapshot.forEach(doc => {
            tokens.push(doc.data().token);
        });

        if (tokens.length === 0) {
            console.log("No tokens found");
            return;
        }

        const message = {
            data: {
                title: "NEON SNAKE",
                body: `${player} reached ${score} points!`
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        console.log("Push sent:", response.successCount);

        response.responses.forEach((resp, idx) => {

            if (!resp.success) {

                const error = resp.error.code;

                if (
                    error === "messaging/registration-token-not-registered" ||
                    error === "messaging/invalid-registration-token"
                ) {

                    const badToken = tokens[idx];

                    db.collection("tokens")
                        .where("token", "==", badToken)
                        .get()
                        .then(snapshot => {
                            snapshot.forEach(doc => doc.ref.delete());
                        });
                }
            }

        });

    }
);