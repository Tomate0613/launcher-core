import { LauncherOptions, Rule } from ".";
import { getOS } from "./os";

function parseRule(options: LauncherOptions, rule: Rule) {
  let v = true;

  if (rule.os) {
    v = rule.os.name == getOS(options);

    // We currently do not parse version, as this is a bit more involved on osx and only used for very old osx versions specifically
    // if (rule.os.version) {
    //   const regex = new RegExp(rule.os.version);
    // }
  }

  if (rule.features) {
    const featureFlags = Object.keys(rule.features);

    v = true;
    for (const feature of options.features ?? []) {
      if (!featureFlags.includes(feature)) {
        v = false;
      }
    }
  }

  if (rule.action == "allow") {
    return v;
  } else {
    return !v;
  }
}

export function parseRules(
  options: LauncherOptions,
  rules: Rule[] | undefined,
): boolean {
  if (!rules || rules.length === 0) {
    return true;
  }

  for (const rule of rules) {
    if (!parseRule(options, rule)) {
      return false;
    }
  }

  return true;
}
