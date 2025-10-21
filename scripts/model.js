/* Constants */
const ERROR_MESSAGES = {
  MODEL_UNAVAILABLE: "LanguageModel not available",
  PROMPT_ERROR: "Error processing prompt",
};

/* Session Management */
let session = null;
let sessionLock = false;

/**
 * Resets the language model session.
 */
async function resetSession() {
  if (session) {
    session.destroy();
  }
  session = null;
  sessionLock = false;
}

/**
 * Ensures a session is available, creating one if necessary.
 * @returns {Promise<Object>} - The language model session.
 */
async function ensureSession() {
  if (!session) {
    session = await LanguageModel.create();
  }
  return session;
}

/* Prompt Execution */

/**
 * Runs a prompt against the language model with the specified schema.
 * @param {string} prompt - The prompt to execute.
 * @param {Object} schema - The schema to constrain the response.
 * @returns {Promise<Object[]>} - A promise that resolves to the parsed response.
 */
export async function runPrompt(prompt, schema) {
  if (!("LanguageModel" in self)) {
    console.error(ERROR_MESSAGES.MODEL_UNAVAILABLE);
    return [];
  }

  while (sessionLock) {
    // Wait until the session is free
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  sessionLock = true; // Lock the session

  try {
    const session = await ensureSession();
    const result = await session.prompt(prompt, { responseConstraint: schema });
    return JSON.parse(result);
  } catch (error) {
    console.error(ERROR_MESSAGES.PROMPT_ERROR, prompt, error);
    await resetSession();
    return [];
  } finally {
    sessionLock = false; // Unlock the session
  }
}
