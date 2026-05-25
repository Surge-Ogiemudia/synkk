require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log("Available models:", data.models.map(m => m.name).filter(n => n.includes('gemini')));
  } catch (e) {
    console.error("Error fetching models:", e);
  }
}
run();
