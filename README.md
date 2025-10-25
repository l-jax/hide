<img width="1584" height="396" alt="hide" src="https://github.com/user-attachments/assets/4d902c17-7d0e-46a5-afdb-960e6712d1d2" />

An AI-powered Google Chrome Extension that hides words you don't want to see.

Made for [Google Chrome Built-in AI Challenge 2025](https://devpost.com/software/hide-58bc2d)

## Features

- Accepts free text input to find out exacty what you want to **hide**
- Covers pages likely to contain unwanted content
- Uses Google's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) to assess the text
- Censors key words, phrases, and sentences
- Reveals the page with unwanted content hidden

## How to Install

Hide is a hackathon project. To try it locally:

1. Clone this repo `git clone https://github.com/l-jax/hide.git`
2. Run `npm install` in the root directory 
3. Run `npm run build`
4. Open Chrome and go to `chrome://extensions/`
5. Enable **Developer mode** in the top right corner
6. Click **Load unpacked** and select the `dist` directory

## How to Use
1. Click on the puzzle piece icon in the top right of Chrome
2. Find **hide** in the list of extensions and pin for easy access
3. Click the **hide** icon to open the popup
4. Type a short prompt explaining what you want to hide
5. Click the button and wait for **hide** to generate keywords related to your topic

<img width="357" height="418" alt="image" src="https://github.com/user-attachments/assets/ec65e133-cebf-4adf-b329-c24fefd8c54f" />

6. Try to visit a website with content that you don't want to see
7. Choose to reveal the page, close the tab, or hide the unwanted content

![hide-loading](https://github.com/user-attachments/assets/957f6c72-c208-4e87-a5f7-277ce76e48aa)


## Work in Progress

- [x] set up basic chrome extension
- [x] hide user-inputted keywords
- [x] hide sentences containing keywords
- [x] use [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) to evaluate page contents
- [x] hide sentences only if summary contains keywords
- [x] accept free text input from user
- [x] use [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) to understand context
- [x] hide sentences only if summary matches context
- [x] improve keyword generation
- [x] improve text chunking
- [x] add logo to popup
- [x] add dynamic loading indicator to overlay
- [x] use rollup
- [x] add an undo button
- [x] add a cancel button
- [x] close popup when user submits request
- [x] store user input with list of keywords to allow rapid decision on unseen pages
- [x] use `<title>` and `<h1>` tags to quickly scan page content
- [x] bring overlay across pages whose title and headings match stored keywords
- [x] prompt user to run full hide if page may contain content they don't want to see
- [x] add keyword handling to popup
- [x] rework prompts to improve keyword generation and text censorship
- [x] display keyword match on overlay
- [x] display hiding hint on overlay
- [x] display keyword loading in popup
- [x] update README to reflect new functionality
