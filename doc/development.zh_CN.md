# 开发指南

## 自动发布

推送 `v版本号` 标签时，GitHub Actions 会运行 lint、契约测试和单元测试，通过后创建 GitHub Release，并上传 `odh-v版本号.zip` 和 `SHA256SUMS`。重跑同一标签的工作流会更新该 Release 的附件。

发布前需将 `src/manifest.json`、`package.json` 和 `package-lock.json` 中的项目版本同步更新；标签必须与前两个文件的版本一致。例如，当前版本为 `1.1.1`，提交并推送代码后执行：

```sh
git tag v1.1.1
git push origin v1.1.1
```

ZIP 仅包含 `src/` 内的扩展文件，根目录为 `manifest.json`，不包含本地私有词典目录 `bg/data/`。下载后解压，在 Chrome 的 `chrome://extensions` 中启用开发者模式，点击“加载已解压的扩展程序”并选择解压目录。

工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需额外配置 Secret。该流程发布下载包，不会自动提交到浏览器扩展商店。

## 创建你的专属脚本

如果您想要显示你个性化在线词典内容，您需要自行创建脚本。因为安全原因，目前自建脚本只能运行在沙盒(HTML5 sandbox)内，但这对于解析网页词典已经够用了。

### 框架和工作流程

原则上，插件会将你的浏览器划词当做输入，而后传递到你的脚本进行在线查询，得到返回的内容后会以弹窗的形式展示。

词典脚本包括了三个部分

1. 创建一个在线词典查询url，绝大多数的情况下，它都是http(s)://example.online.dictionary.com/search?word={your-word}
2. 通过发送上述链接进行查询，并且得到返回的内容。
3. 整理返回的内容，比如使用 Elemenet/CSS selector（元素选择器） (getEelement(s)byXXX or querySelector(All)) 来获得你想要的定义内容

### 代码约定

1. 首先，您需要将您所有的抓取在线字典内容的代码封装在一个类中。为避免重复声明，你最好避免使用过于通用的名称。

    **重要事项：**为了使用显示的名称区分不同的语言，最好使用源语言和目标语言的2位国家代码作为前缀，例如**encn_DictionaryName** 则是以英语作为源语言而中文为翻译结果。

2. 其次，在你的词典类中，你需要起码定义至少一个命名为 findTerm() 的函数，这个函数将会接收你所划的词亦即word作为函数参数，并会返回一个Promise对象。就这么简单。

下边是一个提供给您进行编写的模板。

```javascript
Class YouClassName{
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

你可以在源代码目录[/src/dict](https://github.com/ninja33/ODH/tree/master/src/dict)下找到脚本样例.
