let session = null;

export async function runPrompt(prompt, schema) {
  if (!("LanguageModel" in self)) {
    console.error("LanguageModel not available");
    return [];
  }
  try {
    if (!session) {
      session = await LanguageModel.create();
    }
    const result = await session.prompt(prompt, {
      responseConstraint: schema,
    });
    return JSON.parse(result);
  } catch (e) {
    console.error("Error processing prompt", prompt, e);
    reset();
    return [];
  }
}

async function reset() {
  if (session) {
    session.destroy();
  }
  session = null;
}