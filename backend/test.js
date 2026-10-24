
import "dotenv/config";

const apiKey = process.env.OPENROUTER_API_KEY;
const model =
  process.env.OPENROUTER_MODEL ||
  "nvidia/nemotron-3.5-lightning:free";

if (!apiKey) {
  console.error("❌ OPENROUTER_API_KEY is missing from .env");
  process.exit(1);
}

async function testOpenRouter() {
  try {
    console.log(`Testing model: ${model}`);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content:
                "Write a JavaScript function that adds two numbers. Explain it briefly.",
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ API request failed:", data);
      return;
    }

    console.log("\n✅ OpenRouter is working!");
    console.log("\nAI response:\n");
    console.log(data.choices?.[0]?.message?.content);
  } catch (error) {
    console.error("❌ Connection error:", error.message);
  }
}

testOpenRouter();
