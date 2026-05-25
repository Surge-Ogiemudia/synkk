import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function normalizeMedicineData(rawItems: any[]) {
  console.log(`Normalizing ${rawItems.length} items using Claude AI...`);
  
  // To avoid hitting token limits or timeouts, we might process in batches
  // For this example, we'll assume a batch small enough for one prompt

  const prompt = `You are an expert pharmacist and data clean-up AI. I am providing you with a list of messy medicine names extracted from a pharmacy POS system.
Your job is to normalize and standardize them.
For example:
"AUGMENTIN 625 TAB GLAXO 6S STRIP" -> "Augmentin 625mg - Tablet"
"AMLODIPIN 5MG" -> "Amlodipine 5mg - Tablet"
"PCM 500" -> "Paracetamol 500mg - Tablet"

Return ONLY a JSON array of objects with the fields: 
- "originalName": The exact string provided
- "normalizedName": The cleaned up name
- "strength": The strength (e.g. "500mg")
- "form": The form (e.g. "Tablet", "Capsule", "Syrup", "Injection")

Here are the messy names:
${JSON.stringify(rawItems.map(i => i.name))}
`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4096,
      temperature: 0,
      system: "You are a data normalizer that outputs strictly valid JSON arrays without markdown wrapping or explanations.",
      messages: [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": prompt
            }
          ]
        }
      ]
    });

    const textContent = msg.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error("No text content returned from Claude");
    }

    const jsonStr = textContent.text.trim();
    const normalizedArray = JSON.parse(jsonStr);

    // Merge the normalized data back with the original quantities and prices
    const cleanedInventory = rawItems.map(item => {
      const match = normalizedArray.find((n: any) => n.originalName === item.name);
      return {
        name: match ? match.normalizedName : item.name,
        strength: match ? match.strength : null,
        form: match ? match.form : null,
        quantity: item.quantity,
        price: item.price,
        expiry: item.expiry || null
      };
    });

    return cleanedInventory;
  } catch (error) {
    console.error('Error normalizing medicine data:', error);
    // Fallback to original names if AI fails
    return rawItems;
  }
}
