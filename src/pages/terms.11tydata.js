// Compute plain text here so the HTML layout escapes the title exactly once.
export default {
  eleventyComputed: {
    title: ({ term }) => term ? term.id + " - " + term.label : ""
  }
};
