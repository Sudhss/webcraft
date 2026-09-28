export default {
  id: "start-here",
  n: 0,
  part: "A",
  title: "Start here",
  hook: "How this course works, the four tools you need, and the one habit that makes everything else stick.",
  minutes: 20,
  levels: ["use", "understand"],
  sections: [
    {
      title: "How to read this",
      beats: [
        { t: "say", x: "This course moves one **beat** at a time. Read it, press **Space**, get the next. Short on purpose: you learn by doing, not by scrolling past paragraphs." },
        { t: "say", x: "Every chapter goes three levels deep. **Use** it the way working engineers do. **Understand** what runs underneath. **Rebuild** a small version yourself, in the page." },
        {
          t: "table",
          head: ["Beat", "What you do"],
          rows: [
            ["Predict", "Guess the output before seeing it. Being wrong here is the point."],
            ["Playground", "Edit real code, see it run next to you. Break it on purpose."],
            ["Pitfall", "A lesson that normally costs hundreds of hours. Read these twice."],
            ["Mission", "Build something small without the page holding your hand."],
          ],
        },
        {
          t: "quiz",
          q: "You get a predict beat wrong. What should you do?",
          options: ["Skip it, it's optional", "Change the code in a playground until the answer makes sense", "Reread the previous beat"],
          answer: 1,
          why: "A wrong prediction means your mental model is off by exactly one thing. Poking the code until it clicks fixes the model; rereading usually doesn't.",
        },
      ],
    },
    {
      title: "The four tools",
      beats: [
        { t: "say", x: "You need four things installed. Everything else in this course runs in the browser." },
        {
          t: "table",
          head: ["Tool", "Why", "Check it"],
          rows: [
            ["VS Code", "Editor with a real debugger and a terminal inside", "`code --version`"],
            ["Node.js (LTS)", "Runs JavaScript outside the browser: tools, servers, scripts", "`node -v`"],
            ["Git", "History for your code, and your undo button for life", "`git --version`"],
            ["Chrome", "The best DevTools. You'll live in them", "Press F12"],
          ],
        },
        {
          t: "pitfall",
          h: "Install Node with a version manager",
          x: "Installing Node system-wide means every project shares one version, and one day a project needs another. Use `nvm` (or `fnm`, which is faster) from day one and switch per project with a `.nvmrc` file.",
        },
        {
          t: "code",
          lang: "bash",
          src: "# once\nfnm install --lts\nfnm use --lts\n\n# per project: pin the version so everyone gets the same one\nnode -v > .nvmrc",
          note: "`fnm use` in a folder with `.nvmrc` picks the right version for you.",
        },
      ],
    },
    {
      title: "Your first page, in 10 seconds",
      beats: [
        { t: "say", x: "A web page is a text file the browser turns into pixels. That's the whole trick. Here's one, live. Change the words and watch." },
        {
          t: "play",
          mode: "html",
          title: "hello.html",
          html: "<h1>Hello</h1>\n<p>This is a real page, running in a sandbox next to you.</p>\n<button>Click me</button>",
          css: "body { font-family: system-ui; padding: 24px; }\nh1 { color: #d49a3a; }",
          js: "document.querySelector('button').onclick = () => {\n  console.log('clicked at', Math.round(performance.now()), 'ms');\n};",
          task: "Make the button count its clicks and show the count on itself.",
        },
        { t: "say", x: "Three files, three jobs. **HTML** says what things are. **CSS** says how they look. **JavaScript** says what they do. Keep the jobs separate and pages stay easy to change." },
      ],
    },
    {
      title: "Reading an error like a senior",
      beats: [
        { t: "say", x: "Juniors read the first line of an error and panic. Seniors read the **whole stack**, bottom to top, and find the first line that's *their* code." },
        {
          t: "code",
          lang: "text",
          src: "Uncaught TypeError: Cannot read properties of undefined (reading 'map')\n    at renderList (app.js:42:18)\n    at render (app.js:17:5)\n    at HTMLButtonElement.<anonymous> (app.js:9:3)",
          mark: [1, 2],
          note: "Line 1 is *what*. Line 2 is *where*: `app.js`, line 42, column 18. You were calling `.map` on something that was `undefined`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const user = { name: 'Ada' };\nconsole.log(user.address.city);",
          q: "What happens?",
          options: ["Prints undefined", "TypeError: cannot read 'city' of undefined", "Prints an empty string", "ReferenceError"],
          answer: 1,
          why: "`user.address` is `undefined`, and reading a property of `undefined` throws. `user.address?.city` would give `undefined` instead of crashing.",
        },
        {
          t: "steps",
          h: "The debugging loop that always works",
          items: [
            "Reproduce it on purpose. A bug you can't trigger, you can't fix.",
            "Read the whole error. Find the first frame in your code.",
            "Form one guess. Write it down.",
            "Test only that guess: a log, a breakpoint, a smaller input.",
            "Right? Fix it and add a test. Wrong? The guess taught you something; go to 3.",
          ],
        },
        {
          t: "pitfall",
          h: "The bug is almost never where it crashes",
          x: "The crash is where bad data *arrived*, not where it was *made*. An `undefined` at line 42 was usually created much earlier. Walk the stack upward until you find where the value went wrong.",
        },
      ],
    },
    {
      title: "The habit",
      beats: [
        { t: "say", h: "Predict, then run", x: "Before you run any code in this course, say out loud what it will do. When you're wrong, you just found the exact thing to learn. This habit alone is worth half the course." },
        {
          t: "play",
          mode: "js",
          title: "predict first",
          js: "const a = [3, 1, 10, 2];\na.sort();\nconsole.log(a);",
          task: "Predict the output, then run it. Surprised? Fix the sort so it's numeric.",
        },
        {
          t: "quiz",
          q: "Why does `[3, 1, 10, 2].sort()` give `[1, 10, 2, 3]`?",
          options: ["sort is buggy", "sort compares as strings by default", "sort is not stable", "10 overflows"],
          answer: 1,
          why: "Without a comparator, `sort` converts items to strings and compares them, so \"10\" < \"2\". Use `a.sort((x, y) => x - y)`.",
        },
        {
          t: "mission",
          h: "Set up your lab",
          x: "Install the four tools. Make a folder `lab`, run `git init` in it, add an `index.html` with your name in an `<h1>`, open it in Chrome, and open DevTools. Commit it.",
          hint: "`git add index.html` then `git commit -m \"first page\"`. If git asks who you are, it tells you the exact two commands to run.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Your editor's search across files (Ctrl+Shift+F) is the fastest way to learn any codebase, including your own from three months ago.",
    "Commit small and often. A commit is a save point you can go back to; nobody ever regretted having too many.",
    "When stuck for 20 minutes, explain the problem out loud to anything. Half the time you'll hear the answer yourself.",
    "Read error messages to the end. The fix is often written in them, in the last line nobody reads.",
  ],
  glossary: [
    ["stack trace", "The list of function calls that led to an error, newest first."],
    ["DevTools", "The browser's built-in inspector: elements, console, network, performance."],
    ["LTS", "Long-term support: the Node version that gets fixes for years. Use it."],
  ],
  explain: "Explain the predict-then-run habit to a friend, and why being wrong is useful.",
};
