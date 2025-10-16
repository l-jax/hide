<img width="1584" height="396" alt="hide" src="https://github.com/user-attachments/assets/4d902c17-7d0e-46a5-afdb-960e6712d1d2" />

An AI-powered Google Chrome Extension that hides words you don't want to see.

Under construction for [Google Chrome Built-in AI Challenge 2025](https://googlechromeai2025.devpost.com/)

## Features

- Blocks out web pages to conceal unwanted content
- Accepts free text input to find out exacty what you want to **hide**
- Uses Google's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) to assess the text
- Censors key words, phrases, and sentences
- Reveals the page with unwanted content hidden

## How to Install

Hide is under construction. To try it locally:

1.  Clone this repo
    ```bash
    git clone https://github.com/l-jax/hide.git
    ```
2.  Open Chrome and go to `chrome://extensions/`
3.  Enable **Developer mode** in the top right corner
4.  Click **Load unpacked** and select the root directory

## How to Use

Hide uses a popup to collect user input

1. Click on the puzzle piece icon in the top right of Chrome
2. Find **hide** in the list of extensions and pin for easy access
3. Click the **hide** icon to open the popup
4. Type a short prompt explaining what you want to hide
5. Click the button and watch as the unwanted content disappears

## Work in Progress

- [x] set up basic chrome extension
- [x] hide user-inputted keywords
- [x] hide sentences containing keywords
- [x] use [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) to evaluate page contents
- [x] hide sentences only if summary contains keywords
- [x] accept free text input from user
- [x] use [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) to understand context
- [x] hide sentences only if summary matches context
- [ ] improve keyword generation
- [ ] improve text chunking
- [ ] add logo to popup
- [x] add dynamic loading indicator to overlay
- [ ] use rollup
- [x] add an undo button
- [x] add a cancel button
- [x] close popup when user submits request
