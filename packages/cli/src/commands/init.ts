import path from "path";
import fs from "fs/promises";
import ora from "ora";
import chalk from "chalk";
import { execa } from "execa";
import prompts from "prompts";

const TEMPLATES: Record<string, string> = {
  todo: "todo-app",
  chat: "chat-app",
  notes: "notes-app",
  blank: "blank",
};

const MAX_PACKAGE_NAME_LENGTH = 214;

function getAppNameValidationError(value: string): string | null {
  if (!/^[a-z0-9-]+$/.test(value)) {
    return "App name can only contain lowercase letters, numbers, and dashes.";
  }

  if (value.length > MAX_PACKAGE_NAME_LENGTH) {
    return `App name must be ${MAX_PACKAGE_NAME_LENGTH} characters or fewer.`;
  }

  return null;
}

export async function initCommand(
  appNameArg: string | undefined,
  options: { template: string; install: boolean }
): Promise<void> {
  // ── Step 1: App name ──────────────────────────────────────────────────────
  let appName = appNameArg;

  if (appName !== undefined) {
    const validationError = getAppNameValidationError(appName);

    if (validationError !== null) {
      console.error(chalk.red(`Error: ${validationError}`));
      process.exit(1);
    }
  }

  if (appName === undefined || appName.trim() === "") {
    const response = await prompts({
      type: "text",
      name: "appName",
      message: "What is your app name?",
      initial: "my-zerithdb-app",
      validate: (v: string) => getAppNameValidationError(v) ?? true,
    });
    appName = response.appName as string;
  }

  if (appName === undefined || appName.trim() === "") {
    console.log(chalk.red("Aborted."));
    process.exit(1);
  }

  // ── Step 2: Template selection ────────────────────────────────────────────
  let template = options.template;
  if (!(template in TEMPLATES)) {
    const response = await prompts({
      type: "select",
      name: "template",
      message: "Pick a starter template",
      choices: [
        { title: "✅  Todo App", value: "todo" },
        { title: "💬  Chat App", value: "chat" },
        { title: "📝  Notes App", value: "notes" },
        { title: "📦  Blank", value: "blank" },
      ],
    });
    template = response.template as string;
  }

  const targetDir = path.resolve(process.cwd(), appName);

  // ── Step 3: Scaffold ───────────────────────────────────────────────────────
  const spinner = ora(`Creating ${chalk.cyan(appName)}...`).start();

  try {
    await fs.mkdir(targetDir, { recursive: true });
    await scaffoldTemplate(targetDir, appName, template);
    spinner.succeed(`Created ${chalk.cyan(appName)}`);
  } catch (err) {
    spinner.fail("Scaffold failed");
    console.error(err);
    process.exit(1);
  }

  // ── Step 4: Install ────────────────────────────────────────────────────────
  if (options.install) {
    const installSpinner = ora("Installing dependencies...").start();
    try {
      await execa("npm", ["install"], { cwd: targetDir });
      installSpinner.succeed("Dependencies installed");
    } catch {
      installSpinner.warn("Failed to install dependencies. Run `npm install` manually.");
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
${chalk.green("✔")} ${chalk.bold("Your ZerithDB app is ready!")}

  ${chalk.gray("Next steps:")}
  ${chalk.cyan(`cd ${appName}`)}
  ${chalk.cyan("npm run dev")}

${chalk.gray("Docs:")} https://zerithdb.dev/docs
${chalk.gray("Discord:")} https://discord.gg/MhvuDvzWfF
`);
}

async function scaffoldTemplate(
  targetDir: string,
  appName: string,
  template: string
): Promise<void> {
  // Write package.json
  const pkg = {
    name: appName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
    },
    dependencies: {
      "zerithdb-sdk": "latest",
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
    },
    devDependencies: {
      typescript: "^5.5.0",
      "@types/react": "^18.3.0",
      "@types/node": "^22.0.0",
    },
  };

  await fs.writeFile(path.join(targetDir, "package.json"), JSON.stringify(pkg, null, 2));

  // Write minimal app entry
  const appDir = path.join(targetDir, "src", "app");
  await fs.mkdir(appDir, { recursive: true });

  let indexContent: string;
  switch (template) {
    case "todo":
      indexContent = todoTemplate(appName);
      break;
    case "chat":
      indexContent = chatTemplate(appName);
      break;
    case "notes":
      indexContent = notesTemplate(appName);
      break;
    default:
      indexContent = blankTemplate(appName);
      break;
  }
  const layoutContent = layoutTemplate();

  await fs.writeFile(path.join(appDir, "page.tsx"), indexContent);
  await fs.writeFile(path.join(appDir, "layout.tsx"), layoutContent);

  // .gitignore
  await fs.writeFile(path.join(targetDir, ".gitignore"), "node_modules\n.next\ndist\n.env\n");
}

function layoutTemplate(): string {
  return `"use client";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function todoTemplate(appName: string): string {
  return `"use client";
// ${appName} — ZerithDB Todo App
// Generated by \`npx zerithdb init\`

import { createApp } from "zerithdb-sdk";

const app = createApp({
  appId: "${appName}",
});

app.sync.enable();

export default function App() {
  return <div>Hello from ZerithDB! Edit src/App.tsx to get started.</div>;
}
`;
}

function chatTemplate(appName: string): string {
  return `"use client";
// ${appName} — ZerithDB Chat App
// Generated by \`npx zerithdb init\`

import { createApp } from "zerithdb-sdk";

const app = createApp({
  appId: "${appName}",
});

app.sync.enable();

export default function App() {
  return (
    <div>
      <h1>ZerithDB Chat</h1>
      <p>Real-time P2P chat — no server required. Edit src/app/page.tsx to build your UI.</p>
    </div>
  );
}
`;
}

function notesTemplate(appName: string): string {
  return `"use client";
// ${appName} — ZerithDB Notes App
// Generated by \`npx zerithdb init\`

import { createApp } from "zerithdb-sdk";

const app = createApp({
  appId: "${appName}",
});

app.sync.enable();

export default function App() {
  return (
    <div>
      <h1>ZerithDB Notes</h1>
      <p>Local-first, synced notes — no backend. Edit src/app/page.tsx to build your UI.</p>
    </div>
  );
}
`;
}

function blankTemplate(appName: string): string {
  return `"use client";
// ${appName} — ZerithDB App
import { createApp } from "zerithdb-sdk";

const app = createApp({ appId: "${appName}" });

export default function App() {
  return <div>Hello ZerithDB!</div>;
}
`;
}
