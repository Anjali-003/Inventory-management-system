/*
    Tiny helpers for the CLI scripts (no extra npm package needed).

      arg("name")            -> value of --name "Rahul" or --name=Rahul (undefined when not given)
      await ask("Name: ")    -> asks a question, returns the typed text
      await askHidden("Password: ") -> same, but the typed characters are not shown
*/
const readline = require("readline");

function arg(name) {
    const argv = process.argv.slice(2);
    const flag = `--${name}`;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === flag) return argv[i + 1];
        if (argv[i].startsWith(`${flag}=`)) return argv[i].slice(flag.length + 1);
    }

    return undefined;
}

function ask(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: Boolean(process.stdin.isTTY)
        });

        let muted = false;
        const write = rl._writeToOutput;
        rl._writeToOutput = function (text) {
            if (!muted) write.call(rl, text);
        };

        rl.question(question, (answer) => {
            rl.close();
            process.stdout.write("\n");
            resolve(answer);
        });

        muted = true; // the question text is already printed; hide what is typed after it
    });
}

module.exports = { ask, askHidden, arg };
