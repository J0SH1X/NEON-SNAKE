const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({ region: "europe-west3" });

exports.highscoreAlert = onDocumentCreated(
    "highscores/{scoreId}",
    async (event) => {

        const data = event.data.data();
        const player = data.name;
        const score = data.score;

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
    }
);