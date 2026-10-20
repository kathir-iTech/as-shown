import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
let text;
try {
  text = await readFile(".env.local", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  text = await readFile(".env.example", "utf8");
}
const values = parseEnv(text);
if (!values.ASSHOWN_TOKEN_SECRET) {
  const secret = randomBytes(48).toString("base64url");
  text = /^ASSHOWN_TOKEN_SECRET=.*$/m.test(text)
    ? text.replace(
        /^ASSHOWN_TOKEN_SECRET=.*$/m,
        `ASSHOWN_TOKEN_SECRET=${secret}`,
      )
    : text + `\nASSHOWN_TOKEN_SECRET=${secret}\n`;
}
await writeFile(".env.local", text, { mode: 0o600 });
console.log(
  "Ignored local configuration prepared; no values displayed. Recorded examples need no API key. Configure live access privately only after verifying the free prepaid arrangement.",
);
