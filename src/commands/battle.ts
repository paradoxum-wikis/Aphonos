import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  GuildMember,
  User,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import path from "path";
import { BattleStatsManager } from "../utils/battleStatsManager.js";
import { LockManager } from "../utils/lockManager.js";
import { createHpBar, runBattle } from "../utils/battleEngine.js";
import {
  buildArcanaFighters,
  createArcanaBattleHooks,
} from "../utils/tourney/arcana.js";
import {
  ARCANA_EFFECT,
  ARCANA_FULL_NAME,
  arcanaAttachment,
  arcanaImageUrl,
  type ArcanaArtId,
} from "../utils/tourney/arcanaAssets.js";

export const data = new SlashCommandBuilder()
  .setName("battle")
  .setDescription("Witness an epic clash between two souls in divine combat!")
  .addUserOption((option) =>
    option
      .setName("fighter1")
      .setDescription("The first warrior to enter the arena")
      .setRequired(true),
  )
  .addUserOption((option) =>
    option
      .setName("fighter2")
      .setDescription("The second warrior to challenge fate")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("ranked")
      .setDescription(
        "Start a ranked battle (requires consent from both fighters)",
      )
      .addChoices(
        { name: "True", value: "yes" },
        { name: "False", value: "no" },
      )
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("arcana")
      .setDescription("Apply an Arcana modifier to the battle (casual only)")
      .addChoices(
        ...Object.entries(ARCANA_FULL_NAME).map(([value, name]) => ({
          name,
          value,
        })),
      )
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName("arcana_level")
      .setDescription("Power level for referee Arcanas (1 to 3, defaults to 3)")
      .setMinValue(1)
      .setMaxValue(3)
      .setRequired(false),
  );

export function getRealmName(backgroundFileName: string): string {
  switch (backgroundFileName) {
    case "deathbattle.png":
      return "heavens";
    case "deathbattle2.png":
      return "ruins";
    case "deathbattle3.png":
      return "games";
    case "deathbattle4.png":
      return "Nil Wastelands";
    default:
      return "heavens";
  }
}

export async function createBattleImage(
  fighter1: User,
  fighter2: User,
  fighter1Name: string,
  fighter2Name: string,
  fighter1Member: GuildMember | null,
  fighter2Member: GuildMember | null,
  winner?: User,
  isRanked: boolean = false,
  forceBackground?: string,
): Promise<{ buffer: Buffer; backgroundFileName: string }> {
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");

  let backgroundFileName: string;
  if (forceBackground) {
    backgroundFileName = forceBackground;
  } else if (isRanked) {
    backgroundFileName = "deathbattle2.png";
  } else {
    backgroundFileName =
      Math.random() < 0.1 ? "deathbattle3.png" : "deathbattle.png";
  }

  const possiblePaths = [
    path.join(process.cwd(), "src", backgroundFileName),
    path.join(process.cwd(), "dist", backgroundFileName),
    path.join(process.cwd(), "altershaper-bot", "dist", backgroundFileName),
  ];

  let background: Image | null = null;

  for (const imagePath of possiblePaths) {
    try {
      background = await loadImage(imagePath);
      break;
    } catch (error) {
      continue;
    }
  }

  try {
    if (background) {
      ctx.drawImage(background, 0, 0, 1920, 1080);
    } else {
      ctx.fillStyle = "#2F3136";
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 66px 'URW Gothic', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DEATHBATTLE", 960, 540);
    }

    const fighter1AvatarHash = fighter1Member?.avatar ?? fighter1.avatar;
    const fighter1AnimatedAvatar = fighter1AvatarHash?.startsWith("a_");
    const fighter1AvatarUrl =
      fighter1Member?.displayAvatarURL({
        extension: fighter1AnimatedAvatar ? "gif" : "png",
        size: 512,
      }) ??
      fighter1.displayAvatarURL({
        extension: fighter1AnimatedAvatar ? "gif" : "png",
        size: 512,
      });

    const fighter2AvatarHash = fighter2Member?.avatar ?? fighter2.avatar;
    const fighter2AnimatedAvatar = fighter2AvatarHash?.startsWith("a_");
    const fighter2AvatarUrl =
      fighter2Member?.displayAvatarURL({
        extension: fighter2AnimatedAvatar ? "gif" : "png",
        size: 512,
      }) ??
      fighter2.displayAvatarURL({
        extension: fighter2AnimatedAvatar ? "gif" : "png",
        size: 512,
      });

    const avatar1 = await loadImage(fighter1AvatarUrl);
    const avatar2 = await loadImage(fighter2AvatarUrl);

    ctx.drawImage(avatar1, 225, 285, 512, 512);
    ctx.drawImage(avatar2, 1183, 285, 512, 512);

    if (winner) {
      const tempCanvas = createCanvas(512, 512);
      const tempCtx = tempCanvas.getContext("2d");

      let loserAvatar: Image;
      let loserX: number;

      if (winner.id === fighter1.id) {
        loserAvatar = avatar2;
        loserX = 1183;
      } else {
        loserAvatar = avatar1;
        loserX = 225;
      }

      tempCtx.drawImage(loserAvatar, 0, 0, 512, 512);

      const imageData = tempCtx.getImageData(0, 0, 512, 512);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
        );
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, loserX, 285, 512, 512);

      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(loserX, 285, 512, 512);
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 66px 'URW Gothic', sans-serif";
    ctx.textAlign = "center";

    // name fighter location
    ctx.fillText(fighter1Name, 475, 908);
    ctx.fillText(fighter2Name, 1440, 908);

    return { buffer: await canvas.encode("png"), backgroundFileName };
  } catch (error) {
    ctx.fillStyle = "#2F3136";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 66px 'URW Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DEATHBATTLE", 960, 540);
    return {
      buffer: await canvas.encode("png"),
      backgroundFileName: "deathbattle.png",
    };
  }
}

async function handleConsentPhase(
  interaction: ChatInputCommandInteraction,
  fighter1User: User,
  fighter2User: User,
): Promise<boolean> {
  console.log(`[CONSENT] Starting consent phase for ranked battle`);
  console.log(`[CONSENT] Fighter 1: ${fighter1User.tag} (${fighter1User.id})`);
  console.log(`[CONSENT] Fighter 2: ${fighter2User.tag} (${fighter2User.id})`);

  const consentEmbed = new EmbedBuilder()
    .setColor("#FF6B35")
    .setTitle("⚔️ BATTLE CONSENT REQUIRED")
    .setDescription(
      `**${fighter1User} and ${fighter2User}**\n\n` +
        `A **RANKED** deathbattle has been proposed!\n\n` +
        `🏆 **This is a RANKED battle - results will affect your competitive rating!**\n\n` +
        `Both fighters must consent to engage in combat.\n` +
        `You have **15 seconds** to respond.`,
    )
    .setFooter({
      text: "Glory awaits in the arena of Alteruism!",
    });

  const acceptButton = new ButtonBuilder()
    .setCustomId("accept_battle")
    .setLabel("⚔️ Accept Battle")
    .setStyle(ButtonStyle.Success);

  const declineButton = new ButtonBuilder()
    .setCustomId("decline_battle")
    .setLabel("❌ Decline Battle")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    acceptButton,
    declineButton,
  );

  console.log(`[CONSENT] Sending consent embed with buttons`);
  await interaction.editReply({
    content: `${fighter1User} ${fighter2User}`,
    embeds: [consentEmbed],
    components: [row],
  });

  const acceptedUsers = new Set<string>();

  try {
    console.log(`[CONSENT] Creating message component collector`);
    const collector = interaction.channel!.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15000,
    });

    return new Promise((resolve) => {
      collector.on("collect", async (buttonInteraction) => {
        const userId = buttonInteraction.user.id;
        console.log(
          `[CONSENT] Button interaction from user: ${buttonInteraction.user.tag} (${userId})`,
        );
        console.log(`[CONSENT] Button ID: ${buttonInteraction.customId}`);

        if (userId !== fighter1User.id && userId !== fighter2User.id) {
          console.log(
            `[CONSENT] Unauthorized user ${buttonInteraction.user.tag} tried to respond`,
          );
          await buttonInteraction.reply({
            content:
              "**Only the challenged fighters may respond to this battle!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (buttonInteraction.customId === "accept_battle") {
          acceptedUsers.add(userId);
          console.log(
            `[CONSENT] User ${buttonInteraction.user.tag} accepted the battle`,
          );
          console.log(`[CONSENT] Accepted users: ${Array.from(acceptedUsers)}`);
          await buttonInteraction.reply({
            content: `**You have accepted the battle challenge!**`,
            flags: MessageFlags.Ephemeral,
          });
        } else if (buttonInteraction.customId === "decline_battle") {
          console.log(
            `[CONSENT] User ${buttonInteraction.user.tag} declined the battle`,
          );
          await buttonInteraction.reply({
            content: `**You have declined the battle challenge!**`,
            flags: MessageFlags.Ephemeral,
          });

          console.log(`[CONSENT] Battle declined, stopping collector`);
          collector.stop("declined");
          resolve(false);
          return;
        }

        const bothAccepted =
          acceptedUsers.has(fighter1User.id) &&
          acceptedUsers.has(fighter2User.id);
        console.log(`[CONSENT] Both users accepted check: ${bothAccepted}`);
        console.log(
          `[CONSENT] Fighter1 accepted: ${acceptedUsers.has(fighter1User.id)}`,
        );
        console.log(
          `[CONSENT] Fighter2 accepted: ${acceptedUsers.has(fighter2User.id)}`,
        );

        if (bothAccepted) {
          console.log(`[CONSENT] Both users accepted, proceeding with battle`);
          collector.stop("accepted");
          resolve(true);
        }
      });

      collector.on("end", (collected, reason) => {
        console.log(`[CONSENT] Collector ended with reason: ${reason}`);
        console.log(`[CONSENT] Collected ${collected.size} interactions`);
        if (reason === "time") {
          console.log(`[CONSENT] Consent timed out`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error("[CONSENT] Error in consent phase:", error);
    return false;
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const fighter1User = interaction.options.getUser("fighter1")!;
  const fighter2User = interaction.options.getUser("fighter2")!;
  const rankedOption = interaction.options.getString("ranked") || "no";
  const isRanked = rankedOption === "yes";
  const arcanaChoice = interaction.options.getString(
    "arcana",
  ) as ArcanaArtId | null;
  const arcanaLevel = (interaction.options.getInteger("arcana_level") ?? 3) as
    1 | 2 | 3;
  const activeArcana: ArcanaArtId | null = isRanked ? "justice" : arcanaChoice;

  if (isRanked && interaction.guildId !== "1362084781134708907") {
    await interaction.reply({
      content:
        "**RANKED BATTLES CAN ONLY BE CONDUCTED IN THE SACRED ALTER EGO WIKI (.gg/yfZUQ3h4cf)! This server does not have permission for competitive combat.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  console.log(`[DEATHBATTLE] Starting deathbattle command`);
  console.log(
    `[DEATHBATTLE] Fighter 1: ${fighter1User.tag} (${fighter1User.id})`,
  );
  console.log(
    `[DEATHBATTLE] Fighter 2: ${fighter2User.tag} (${fighter2User.id})`,
  );
  console.log(`[DEATHBATTLE] Ranked option: ${rankedOption}`);
  console.log(`[DEATHBATTLE] Is ranked: ${isRanked}`);
  console.log(
    `[DEATHBATTLE] Command user: ${interaction.user.tag} (${interaction.user.id})`,
  );

  if (fighter1User.id === fighter2User.id) {
    console.log(`[DEATHBATTLE] Same user selected for both fighters`);
    await interaction.reply({
      content:
        "**A soul cannot battle against itself! Choose two different warriors!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    isRanked &&
    interaction.user.id !== fighter1User.id &&
    interaction.user.id !== fighter2User.id
  ) {
    console.log(`[DEATHBATTLE] Ranked battle initiated by non-participant`);
    await interaction.reply({
      content:
        "**For RANKED battles, you must be one of the fighters! You can only challenge others or accept challenges in ranked mode.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (isRanked && arcanaChoice) {
    await interaction.reply({
      content:
        "**Arcana modifiers are casual-only! RANKED battles always run under Justice.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (LockManager.isLocked(interaction.guildId!, "tourney")) {
    await interaction.reply({
      content:
        "The Aphonos Playoffs is happening! No other battles are allowed to be started until it ends.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (LockManager.isLocked(interaction.guildId!, "battle")) {
    console.log(
      `[DEATHBATTLE] Battle already active in guild ${interaction.guildId}, rejecting new battle`,
    );
    await interaction.reply({
      content:
        "**THE ARENA IS OCCUPIED! Another grand battle is already taking place in the halls. Wait for the current clash to conclude before summoning new warriors to the arena!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    LockManager.isUserBusy(fighter1User.id) ||
    LockManager.isUserBusy(fighter2User.id)
  ) {
    console.log(
      `[DEATHBATTLE] One of the fighters is already in a battle elsewhere`,
    );
    await interaction.reply({
      content:
        "**ONE OF THE CHOSEN WARRIORS IS ALREADY ENGAGED IN COMBAT! Wait for their current battle to finish before challenging them again!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lockAcquired = LockManager.acquireLock(interaction.guildId!, "battle", [
    fighter1User.id,
    fighter2User.id,
  ]);

  if (!lockAcquired) {
    // This is a fallback, should never happen as it should be caught by the checks above
    await interaction.reply({
      content: "**Failed to acquire a battle lock. The arena might be busy.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    if (isRanked) {
      console.log(
        `[DEATHBATTLE] This is a ranked battle, starting consent phase`,
      );
      const consentGiven = await handleConsentPhase(
        interaction,
        fighter1User,
        fighter2User,
      );

      console.log(`[DEATHBATTLE] Consent phase result: ${consentGiven}`);

      if (!consentGiven) {
        console.log(`[DEATHBATTLE] Consent not given, cancelling battle`);
        const cancelEmbed = new EmbedBuilder()
          .setColor("#8B0000")
          .setTitle("⚔️ RANKED BATTLE CANCELLED")
          .setDescription(
            `The **RANKED** battle has been cancelled.\n\n` +
              `*The warriors have chosen not to engage in competitive combat at this time.*`,
          )
          .setFooter({ text: "🔓 Arena is now available for new battles." });

        await interaction.editReply({
          content: "",
          embeds: [cancelEmbed],
          components: [],
        });
        return;
      }
    } else {
      console.log(
        `[DEATHBATTLE] This is a casual battle, skipping consent phase`,
      );
    }

    console.log(`[DEATHBATTLE] Proceeding with battle setup`);

    let fighter1DisplayName: string;
    let fighter2DisplayName: string;
    let fighter1Member: GuildMember | null = null;
    let fighter2Member: GuildMember | null = null;

    if (interaction.inGuild()) {
      fighter1Member = await interaction.guild!.members.fetch(fighter1User.id);
      fighter2Member = await interaction.guild!.members.fetch(fighter2User.id);
      fighter1DisplayName = fighter1Member.displayName;
      fighter2DisplayName = fighter2Member.displayName;
    } else {
      fighter1DisplayName = fighter1User.username;
      fighter2DisplayName = fighter2User.username;
    }

    const [fighter1, fighter2] = buildArcanaFighters(
      activeArcana,
      fighter1User,
      fighter1DisplayName,
      fighter2User,
      fighter2DisplayName,
    );

    const imageResult = await createBattleImage(
      fighter1User,
      fighter2User,
      fighter1DisplayName,
      fighter2DisplayName,
      fighter1Member,
      fighter2Member,
      undefined,
      isRanked,
    );
    const attachment = new AttachmentBuilder(imageResult.buffer, {
      name: "deathbattle.png",
    });
    const files = [attachment];
    if (activeArcana) files.push(arcanaAttachment(activeArcana));

    const realmName = getRealmName(imageResult.backgroundFileName);
    const firstMover =
      fighter1.speed >= fighter2.speed ? fighter1.name : fighter2.name;

    const setupEmbed = new EmbedBuilder()
      .setColor(isRanked ? "#FF6B35" : "#2E2B5F")
      .setTitle(
        `⚔️ THE ${realmName.toUpperCase()} HAVE DECLARED A ${isRanked ? "RANKED " : ""}DEATHBATTLE!`,
      )
      .setDescription(
        `**Two warriors enter the sacred arena of combat!**\n\n` +
          (isRanked
            ? `🏆 **RANKED BATTLE** - Results will affect competitive ratings!\n⚖️ **Justice Arcana** - both fighters have 100% aura!\n\n`
            : "") +
          (arcanaChoice
            ? `🃏 **${ARCANA_FULL_NAME[arcanaChoice]}** - ${ARCANA_EFFECT[arcanaChoice]}\n\n`
            : "") +
          `**${fighter1.name}** vs **${fighter2.name}**\n\n` +
          `🏃 **${firstMover}** moves first with superior speed!\n\n` +
          `**Fighter Stats:**\n` +
          `🔴 **${fighter1.name}**: ${fighter1.maxHp} HP | ${fighter1.attack} ATK | ${fighter1.defense} DEF | ${fighter1.speed} SPD\n` +
          `🔵 **${fighter2.name}**: ${fighter2.maxHp} HP | ${fighter2.attack} ATK | ${fighter2.defense} DEF | ${fighter2.speed} SPD\n\n` +
          `💨 **Speed Advantage:** Higher speed grants +1% dodge chance per point difference\n` +
          `⚔️ **Battle begins in 3 seconds...**`,
      )
      .setImage("attachment://deathbattle.png")
      .setFooter({
        text: `🔒 Arena locked - ${isRanked ? "RANKED " : ""}Battle in progress...`,
      });
    if (activeArcana) setupEmbed.setThumbnail(arcanaImageUrl(activeArcana));

    await interaction.editReply({
      content: "",
      embeds: [setupEmbed],
      files,
      components: [],
    });

    const battleImageOnly = (await interaction.fetchReply()).attachments
      .filter((a) => a.name === "deathbattle.png")
      .toJSON();

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = await runBattle(fighter1, fighter2, {
      turnCap: 55,
      realmName,
      turnDelayMs: 2000,
      hooks: createArcanaBattleHooks(activeArcana, arcanaLevel),
      onTurn: async ({ turn, fighter1: f1, fighter2: f2, battleLog }) => {
        const progressEmbed = new EmbedBuilder()
          .setColor(isRanked ? "#FF6B35" : "#35C2FF")
          .setTitle(`⚔️ ${isRanked ? "RANKED " : ""}BATTLE IN PROGRESS`)
          .setDescription(
            `**Turn ${turn}** - The battle rages on!\n\n` +
              `**Current HP:**\n` +
              `🔴 **${f1.name}**: ${f1.hp}/${f1.maxHp} HP\n` +
              `${createHpBar(f1.hp, f1.maxHp)}\n\n` +
              `🔵 **${f2.name}**: ${f2.hp}/${f2.maxHp} HP\n` +
              `${createHpBar(f2.hp, f2.maxHp)}\n\n` +
              `**The Battle:**\n` +
              battleLog.slice(-5).join("\n"),
          )
          .setImage("attachment://deathbattle.png")
          .setFooter({
            text: `🔒 Arena locked - ${isRanked ? "RANKED " : ""}Battle in progress...`,
          });

        await interaction.editReply({
          embeds: [progressEmbed],
          attachments: battleImageOnly,
        });
      },
    });

    const { winner, loser, turns: turn, battleLog, hitTurnCap } = result;

    await BattleStatsManager.recordBattle(
      winner.user.id,
      winner.user.tag,
      loser.user.id,
      loser.user.tag,
      turn,
      winner.hp,
      winner.maxHp,
      isRanked,
      interaction.guildId || undefined,
      arcanaChoice ?? undefined,
    );

    const finalImageResult = await createBattleImage(
      fighter1User,
      fighter2User,
      fighter1DisplayName,
      fighter2DisplayName,
      fighter1Member,
      fighter2Member,
      winner.user,
      isRanked,
      imageResult.backgroundFileName,
    );
    const finalAttachment = new AttachmentBuilder(finalImageResult.buffer, {
      name: "deathbattle-final.png",
    });

    const winnerStats = await BattleStatsManager.getUserStats(winner.user.id);
    const loserStats = await BattleStatsManager.getUserStats(loser.user.id);

    const finalEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle(`🏆 THE ${isRanked ? "RANKED " : ""}DEATHBATTLE HAS CONCLUDED`)
      .setDescription(
        `**${winner.name}** emerges victorious after ${turn} turns!\n\n` +
          (hitTurnCap
            ? "**The heavens are satisfied. The battle has been forcefully stopped, the combatant with the lowest health has been executed!**\n\n"
            : "") +
          `**Final Results:**\n` +
          `🏆 **Victor:** ${winner.name} (${winner.hp}/${winner.maxHp} HP)\n` +
          `💀 **Defeated:** ${loser.name} (0/${loser.maxHp} HP)\n\n` +
          `**Battle Conclusion:**\n` +
          battleLog.slice(-3).join("\n") +
          "\n\n" +
          (isRanked
            ? `**Updated Ranked Battle Records:**\n` +
              `🏆 **${winner.name}:** ${winnerStats?.rankedWins || 1}W-${winnerStats?.rankedLosses || 0}L (${(winnerStats?.rankedWeightedScore || 0).toFixed(2)} WS)\n` +
              `💀 **${loser.name}:** ${loserStats?.rankedWins || 0}W-${loserStats?.rankedLosses || 1}L (${(loserStats?.rankedWeightedScore || 0).toFixed(2)} WS)\n\n`
            : "") +
          `*The arena falls silent as ${winner.name} stands triumphant...*`,
      )
      .setImage("attachment://deathbattle-final.png")
      .setFooter({
        text: `${isRanked ? "Ranked " : ""}Battle lasted ${turn} turns | 🔓 Arena is now available for new battles.`,
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [finalEmbed],
      files: [finalAttachment],
      components: [],
    });
  } catch (error) {
    console.error("Deathbattle error:", error);
    await interaction.editReply({
      content:
        "**THE DIVINE POWERS HAVE FAILED TO MANIFEST THE BATTLE! The arena remains empty.**",
      components: [],
    });
  } finally {
    LockManager.releaseLock(interaction.guildId!, "battle");
    console.log(
      `[DEATHBATTLE] Released battle lock for guild ${interaction.guildId}`,
    );
  }
}
