# Development Guide

[[简体中文版](development.zh_CN.md)]

## Automated releases

Push a `v<version>` tag to run lint, contract tests, and unit tests. Once they pass, GitHub Actions creates a GitHub Release with `odh-v<version>.zip` and `SHA256SUMS`. Re-running the workflow for the same tag updates the release assets.

Before releasing, update the project version in `src/manifest.json`, `package.json`, and `package-lock.json`. The tag must match the manifest and package versions. For example, after committing and pushing the current `1.1.1` version:

```sh
git tag v1.1.1
git push origin v1.1.1
```

The ZIP contains the extension files from `src/`, with `manifest.json` at the archive root, excluding the local private dictionary directory `bg/data/`. Extract it, enable Developer mode in Chrome at `chrome://extensions`, and choose **Load unpacked** to select the extracted directory.

The workflow uses the automatically supplied `GITHUB_TOKEN`; no additional secret is required. It publishes downloadable files without submitting to a browser extension store.

## Start your own script

If you want to display your own online dictionary content, you need build the script by yourself.
Because of security issues, currently the script can only run in HTML3 sandbox, but it's enough to complete your work.

### Framework & Workflow

Basically, the extension will accept your browser word selection as input, pass it to your own dictionary script for online query, then get returned content and show it in browser popup window.

The dictionary script contains three parts:

1. Form an online dictionary query url pattern. In most cases, it's like `http(s)://example.online.dictionary.com/search?word={your-word}`
2. Perform online query by sending the url above, and get the web page content.
3. You may need to use Element/CSS selector (`getElement(s)byXXX or querySelector(All)`) to get the definition part you want.

### Coding convention

1. First of all, you need wrap all of your online dictionary scraping code in a Class. To avoid duplicated declaration, you'd better not use a name too general.

    **Important:** To distinguish different language by displayname, you'd better use 2 digit country code for both source and target language as prefix, like **encn_DictionryName** for dictionary taking English as source and Chinese as target.

2. Second, in your dictionary Class, you need define at least one function named `findTerm()` , which accepts **word** as function parameter, return a Promise object. That's all.

Below is a script template to start your own coding.

```javascript
Class YourClassName{
    constructor() {
        // Your code starting here ...
    }

    findTerm(word) {
        return new Promise((resolve, reject){
        // Your code starting here ...
        // resolve(content);
        // reject(error);
        });
    }
}
```

You can find the dictionary script source code sample under [/src/dict](https://github.com/ninja33/ODH/tree/master/src/dict) of this repository.
