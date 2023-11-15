// Create reference instance
import { marked } from "marked";
import yaml from "js-yaml";
import {
  readdirSync,
  statSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  watch,
} from "fs";
// handlebars
import Handlebars from "handlebars";
import { execSync } from "child_process";
import c from "chalk";

const NOTES_DIR = process.env.NOTES_DIR || "./sample-notes";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";

const index = readFileSync("./templates/index.hbs", "utf8");
const template = Handlebars.compile(index);
const article = readFileSync("./templates/article.hbs", "utf8");
const articleTemplate = Handlebars.compile(article);
// TODO tags

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR + "/articles", { recursive: true });
mkdirSync(OUTPUT_DIR + "/tags", { recursive: true });

// Set options
marked.use({
  gfm: true, // github flavored markdown
});

// create a flat array of all files in the directory, and traverse subdirectories recursively
function findMarkdownFiles(path) {
  let files = [];
  readdirSync(path).forEach((filename) => {
    if (filename.endsWith(".obsidian")) {
      return;
    }
    if (filename.endsWith(".md")) {
      files.push({ path: path + "/" + filename });
    } else {
      const stat = statSync(path + "/" + filename);
      if (stat.isDirectory()) {
        files = files.concat(findMarkdownFiles(path + "/" + filename));
      }
    }
  });
  return files;
}

function publish() {
  let markdownFiles = findMarkdownFiles(NOTES_DIR);
  for (const markdownFile of markdownFiles) {
    const file = readFileSync(markdownFile.path, "utf8");
    const stat = statSync(markdownFile.path);
    markdownFile.created = new Date(stat.birthtime).toISOString().split("T")[0];
    markdownFile.updated = new Date(stat.mtime).toISOString().split("T")[0];

    const lines = file.split("\n");

    // Find the start and end of the YAML properties header
    let startLine = null;
    let endLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        if (startLine === null) {
          startLine = i;
        } else {
          endLine = i;
          break;
        }
      }
    }
    const yamlHeader = lines.slice(startLine + 1, endLine).join("\n");
    const fileContents = lines.slice(endLine + 1).join("\n");
    markdownFile.title = markdownFile.path
      .split("/")
      .pop()
      .replace(/\.md$/, "");
    try {
      // console.log(yamlHeader);
      const properties = yaml.load(yamlHeader);
      if (!properties?.tags?.includes("public")) {
        continue;
      }
      markdownFile.public = true;
      markdownFile.tags = properties.tags;
      markdownFile.title = properties.title || markdownFile.title;
      markdownFile.created = properties.created
        ? new Date(properties.created).toISOString().split("T")[0]
        : markdownFile.created;
      markdownFile.updated = properties.updated
        ? new Date(properties.updated).toISOString().split("T")[0]
        : markdownFile.updated;
      markdownFile.slug = markdownFile.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-/, "")
        .replace(/-$/, "");
      // +
      // "-" +
      // markdownFile.created;
    } catch (err) {
      console.error("Error parsing YAML header", err);
      continue;
    }
    const content = marked(fileContents);
    const html = articleTemplate({
      content: content,
      title: markdownFile.title,
      date: markdownFile.created,
      updated: markdownFile.updated,
    });
    writeFileSync(
      OUTPUT_DIR + "/articles/" + markdownFile.slug + ".html",
      html
    );
  }
  // Important! Filter non-public notes
  markdownFiles = markdownFiles.filter((file) => file.public);
  const yearPosts = [];
  const uniqueYears = [
    ...new Set(markdownFiles.map((file) => file.created.split("-")[0])),
  ];
  uniqueYears.sort().reverse();
  for (const year of uniqueYears) {
    const posts = markdownFiles.filter(
      (file) => file.created.split("-")[0] === year
    );
    posts.sort((a, b) => {
      return a.created > b.created ? -1 : 1;
    });
    yearPosts.push({ year, posts });
  }
  const html = template({ yearPosts });
  writeFileSync(OUTPUT_DIR + "/index.html", html);
  console.log(`Published ${markdownFiles.length} articles`);
  execSync(`npx wrangler pages deploy output`);
}

// watch files for changes and publish on every change

watch(NOTES_DIR, { recursive: true }, (eventType, filename) => {
  console.log(`File ${filename} changed [${eventType}]`);
  publish();
});

console.log(c.green(`Watching for changes in ${NOTES_DIR} ...`));
