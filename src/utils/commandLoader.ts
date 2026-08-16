import { Collection } from "discord.js";
import * as kick from "../commands/kick.js";
import * as ban from "../commands/ban.js";
import * as timeout from "../commands/timeout.js";
import * as clear from "../commands/clear.js";
import * as warn from "../commands/warn.js";
import * as sins from "../commands/sins.js";
import * as removesin from "../commands/removesin.js";
import * as archives from "../commands/archives.js";
import * as help from "../commands/help.js";
import * as avatar from "../commands/avatar.js";
import * as info from "../commands/info.js";
import * as link from "../commands/link.js";
import * as removelink from "../commands/removelink.js";
import * as checklink from "../commands/checklink.js";
import * as syncroles from "../commands/syncroles.js";
import * as slowmode from "../commands/slowmode.js";
import * as oracle from "../commands/oracle.js";
import * as trivia from "../commands/trivia.js";
import * as aura from "../commands/aura.js";
import * as battle from "../commands/battle.js";
import * as battlestats from "../commands/battlestats.js";
import * as tourney from "../commands/tourney.js";
import * as civilization from "../commands/civilization.js";

import * as furry from "../commands/furry.js";
import * as anime from "../commands/anime.js";
import * as ship from "../commands/ship.js";
import * as webhook from "../commands/webhook.js";
import * as family from "../commands/family.js";
import * as giveaway from "../commands/giveaway.js";
import * as asset from "../commands/asset.js";
import * as reactionrole from "../commands/reactionrole.js";
import * as russian from "../commands/russian.js";
import * as russianstats from "../commands/russianstats.js";
import * as interchat from "../commands/interchat.js";
import * as job from "../commands/job.js";

export interface Command {
  data: unknown;
  execute: Function;
}

export function loadCommands(): Collection<string, Command> {
  const commands = new Collection<string, Command>();

  const commandModules = [
    kick,
    ban,
    timeout,
    clear,
    warn,
    sins,
    removesin,
    archives,
    help,
    avatar,
    info,
    link,
    removelink,
    checklink,
    syncroles,
    slowmode,
    oracle,
    trivia,
    aura,
    battle,
    battlestats,
    tourney,
    civilization,
    furry,
    anime,
    ship,
    webhook,
    family,
    giveaway,
    asset,
    reactionrole,
    russian,
    russianstats,
    interchat,
    ...(job.LLM_ENABLED ? [job] : []),
  ];

  for (const command of commandModules) {
    commands.set(command.data.name, command);
  }

  return commands;
}
