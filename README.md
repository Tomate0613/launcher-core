# Tomate Launcher Core

## Basic Setup

```ts
import { loader } from "tomate-loaders";
import { Launcher } from "tomate-launcher-core";
import { Auth } from "msmc";

const launcher = new Launcher({
  ...(await loader("vanilla").getMCLCLaunchConfig({
    rootPath: "./minecraft/",
    gameVersion: "1.21.10",
  })),
});

await launcher.javaTasks("./java/");

const authManager = new Auth("select_account");
const xboxManager = await authManager.launch("raw");
const token = await xboxManager.getMinecraft();

launcher.launch({
  memory: {
    min: "5G",
    max: "6G",
  },
  authorization: token.mclc(),
});
```

## Attributions

This project is based on
[minecraft-launcher-core](https://github.com/Pierce01/MinecraftLauncher-core)
by Pierce01

While rewritten (in typescript), portions of the original source code
have been adapted under the terms of its license
(See [LICENSE](./LICENSE))

