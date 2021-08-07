const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");
const { WebhookClient } = require("dialogflow-fulfillment");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://admin-if-bot-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const { SessionsClient } = require("dialogflow");

exports.addMessage = functions.https.onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into Firestore using the Firebase Admin SDK.
  const writeResult = await admin
    .firestore()
    .collection("messages")
    .add({ original: original });
  // Send back a message that we've successfully written the message
  res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

// Listens for new messages added to /messages/:documentId/original and creates an
// uppercase version of the message to /messages/:documentId/uppercase
exports.makeUppercase = functions.firestore
  .document("/messages/{documentId}")
  .onCreate((snap, context) => {
    // Grab the current value of what was written to Firestore.
    const original = snap.data().original;

    // Access the parameter `{documentId}` with `context.params`
    functions.logger.log("Uppercasing", context.params.documentId, original);

    const uppercase = original.toUpperCase();

    // You must return a Promise when performing asynchronous tasks inside a Functions such as
    // writing to Firestore.
    // Setting an 'uppercase' field in Firestore document returns a Promise.
    return snap.ref.set({ uppercase }, { merge: true });
  });

exports.dialogflowGateway = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    const { queryInput, sessionId } = request.body;

    const sessionClient = new SessionsClient({ credentials: serviceAccount });
    const session = sessionClient.sessionPath("admin-if-bot-jas9", sessionId);
    const responses = await sessionClient.detectIntent({ session, queryInput });
    console.log("Detected intent");
    console.log(responses);

    const result = responses[0].queryResult;
    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);

    response.send(result);
  });
});

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
  async (request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log(JSON.stringify(request.body));
    const result = request.body.queryResult;

    function welcome(agent) {
      agent.add(`Welcome to my agent yoo!`);
    }
    function fallback(agent) {
      agent.add(`I didn't understand`);
      agent.add(`I'm sorry, can you try again?`);
    }
    async function userOnboardingHandler(agent) {
      // Do backend stuff here
      const db = admin.firestore();
      const profile = db.collection("users").doc("aldianu");

      const { name, color } = result.parameters;

      await profile.set({ name, color });
      agent.add(`Welcome aboard my friend!`);
    }

    let intentMap = new Map();
    intentMap.set("Default Welcome Intent", welcome);
    intentMap.set("Default Fallback Intent", fallback);
    // intentMap.set("UserOnboarding", userOnboardingHandler);
    agent.handleRequest(intentMap);
  }
);
