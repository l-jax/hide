export async function generateSummary(textNode) {
  const options = {
    sharedContext:
      "This describes content a user does not want to see. Generate a summary that captures the essence of the content so it can be identified and hidden in the future.",
    type: textNode.type,
    format: textNode.format,
    length:
      textNode.length < 500
        ? "short"
        : textNode.length < 2000
        ? "medium"
        : "long",
  };

  try {
    const availability = await Summarizer.availability();
    let summarizer;
    if (availability === "unavailable") {
      console.log("Summarizer API is not available");
      return null;
    }

    if (availability === "available") {
      summarizer = await Summarizer.create(options);
    } else {
      summarizer = await Summarizer.create(options);
      summarizer.addEventListener("downloadprogress", (e) => {
        console.log(`Downloaded ${e.loaded * 100}%`);
      });
      await summarizer.ready;
    }

    const summary = await summarizer.summarize(textNode.nodeValue);
    summarizer.destroy();
    return summary;
  } catch (e) {
    console.log("Summary generation failed");
    console.error(e);
    return null;
  }
}
