import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
  User,
} from "discord.js";
import { FamilyManager } from "../utils/familyManager.js";
import { FamilyTreeRenderer, TreeMember } from "../utils/familyTreeRenderer.js";
import { container, gallery, section, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("family")
  .setDescription("Manage your family relationships")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("tree")
      .setDescription("View a visual family tree")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user whose family tree to view")
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("full")
          .setDescription(
            "Include distant relatives that aren't directly related",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("profile")
      .setDescription("View family relationships as a text list")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user whose family profile to view")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("marry")
      .setDescription("Propose marriage to another user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user you want to marry")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("divorce")
      .setDescription("Divorce your spouse")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Your spouse to divorce")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("adopt")
      .setDescription("Adopt another user as your child")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user you want to adopt")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("disown")
      .setDescription("Disown your child or remove your parent")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The family member to disown")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sibling")
      .setDescription("Become siblings with another user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user you want to be siblings with")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unsibling")
      .setDescription("Remove sibling relationship")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The sibling to remove")
          .setRequired(true),
      ),
  );

function box(color: string, title: string, body: string) {
  return container(color).addTextDisplayComponents(text(`## ${title}\n${body}`));
}

function note(color: string, md: string) {
  return container(color).addTextDisplayComponents(text(md));
}

function withRow(
  color: string,
  title: string,
  body: string,
  row: ActionRowBuilder<ButtonBuilder>,
) {
  return box(color, title, body).addActionRowComponents(row);
}

function proposal(
  color: string,
  title: string,
  body: string,
  avatarUrl: string,
  row: ActionRowBuilder<ButtonBuilder>,
) {
  return container(color)
    .addSectionComponents(section(`## ${title}\n${body}`, avatarUrl))
    .addActionRowComponents(row);
}

async function sendProposal(
  interaction: ChatInputCommandInteraction,
  targetUser: User,
  followUp: boolean,
  opts: {
    color: string;
    title: string;
    body: string;
    acceptId: string;
    declineId: string;
    notForYou: string;
    timeoutTitle: string;
    timeoutBody: string;
    declineTitle: string;
    declineBody: string;
    onAccept: () => Promise<{ title: string; body: string }>;
  },
) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(opts.acceptId)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(opts.declineId)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  );

  const payload = {
    components: [
      proposal(
        opts.color,
        opts.title,
        `${targetUser}\n${opts.body}`,
        targetUser.displayAvatarURL(),
        row,
      ),
    ],
    allowedMentions: { users: [targetUser.id] },
    flags: V2,
  };

  const response = followUp
    ? await interaction.followUp(payload)
    : await interaction.reply(payload);

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== targetUser.id) {
      await i.reply({
        content: opts.notForYou,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (i.customId === opts.acceptId) {
      const success = await opts.onAccept();
      await i.update({
        components: [box("#00FF00", success.title, success.body)],
        flags: V2,
      });
    } else {
      await i.update({
        components: [box("#FF0000", opts.declineTitle, opts.declineBody)],
        flags: V2,
      });
    }

    collector.stop();
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await response.edit({
        components: [box("#808080", opts.timeoutTitle, opts.timeoutBody)],
        flags: V2,
      });
    }
  });
}

async function sendWarningThen(
  interaction: ChatInputCommandInteraction,
  opts: {
    title: string;
    body: string;
    proceedId: string;
    cancelId: string;
    cancelText: string;
    sendingText: string;
    sendingColor: string;
    timeoutBody: string;
    then: () => Promise<void>;
  },
) {
  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(opts.proceedId)
      .setLabel("Proceed Anyway")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(opts.cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  const warningResponse = await interaction.reply({
    components: [withRow("#FFA500", opts.title, opts.body, confirmRow)],
    flags: V2,
  });

  const warningCollector = warningResponse.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000,
  });

  warningCollector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({
        content: "**Only the person who initiated this can respond!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (i.customId === opts.cancelId) {
      await i.update({
        components: [note("#808080", opts.cancelText)],
        flags: V2,
      });
      warningCollector.stop();
      return;
    }

    await i.update({
      components: [note(opts.sendingColor, opts.sendingText)],
      flags: V2,
    });
    warningCollector.stop();
    await opts.then();
  });

  warningCollector.on("end", async (collected) => {
    if (collected.size === 0) {
      await warningResponse.edit({
        components: [box("#808080", "⏱️ WARNING EXPIRED", opts.timeoutBody)],
        flags: V2,
      });
    }
  });
}

async function sendConfirm(
  interaction: ChatInputCommandInteraction,
  opts: {
    title: string;
    body: string;
    confirmId: string;
    confirmLabel: string;
    cancelId: string;
    cancelText: string;
    timeoutTitle: string;
    timeoutBody: string;
    onConfirm: () => Promise<{ title: string; body: string }>;
  },
) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(opts.confirmId)
      .setLabel(opts.confirmLabel)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(opts.cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    components: [withRow("#FFA500", opts.title, opts.body, row)],
    flags: V2,
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({
        content: "**Only the person who initiated this can respond!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (i.customId === opts.confirmId) {
      const success = await opts.onConfirm();
      await i.update({
        components: [box("#808080", success.title, success.body)],
        flags: V2,
      });
    } else {
      await i.update({
        components: [note("#808080", opts.cancelText)],
        flags: V2,
      });
    }

    collector.stop();
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await response.edit({
        components: [box("#808080", opts.timeoutTitle, opts.timeoutBody)],
        flags: V2,
      });
    }
  });
}

async function tagsOf(
  interaction: ChatInputCommandInteraction,
  ids: string[],
): Promise<string[]> {
  return Promise.all(
    ids.map(async (id) => {
      const user = await interaction.client.users.fetch(id);
      return user.tag;
    }),
  );
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "tree": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const full = interaction.options.getBoolean("full") ?? false;
        const graph = await FamilyManager.getFamilyGraph(targetUser.id, full);

        if (graph.memberIds.length <= 1) {
          await interaction.reply({
            content: `**${targetUser.tag} has no family relationships yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply();

        const members = new Map<string, TreeMember>();
        await Promise.all(
          graph.memberIds.map(async (id) => {
            const user =
              id === targetUser.id
                ? targetUser
                : await interaction.client.users.fetch(id).catch(() => null);
            members.set(
              id,
              user
                ? {
                    name: user.displayName,
                    avatarUrl: user.displayAvatarURL({
                      extension: "png",
                      size: 128,
                    }),
                    isRoot: id === targetUser.id,
                  }
                : {
                    name: "Unknown",
                    avatarUrl: null,
                    isRoot: id === targetUser.id,
                  },
            );
          }),
        );

        const treeBuffer = await FamilyTreeRenderer.generateTree(members, {
          parents: graph.parents,
          spouses: graph.spouses,
          siblings: graph.siblings,
        });

        const attachment = new AttachmentBuilder(treeBuffer, {
          name: "family-tree.png",
        });

        await interaction.editReply({
          components: [
            container("#cdcdcd")
              .addTextDisplayComponents(
                text(
                  `## 🌳 FAMILY TREE\n**${targetUser.tag}**'s ${full ? "big old " : ""}family tree!`,
                ),
              )
              .addMediaGalleryComponents(
                gallery("attachment://family-tree.png"),
              ),
          ],
          files: [attachment],
          flags: V2,
        });
        break;
      }

      case "profile": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const relationships = await FamilyManager.getUserRelationships(
          targetUser.id,
        );

        if (relationships.length === 0) {
          await interaction.reply({
            content: `**${targetUser.tag} has no family relationships yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const spouses = await FamilyManager.getSpouses(targetUser.id);
        const children = await FamilyManager.getChildren(targetUser.id);
        const parents = await FamilyManager.getParents(targetUser.id);
        const siblings = await FamilyManager.getSiblings(targetUser.id);

        const parts = [
          `## 👤 FAMILY PROFILE\nFamily relationships for **${targetUser.tag}**`,
        ];

        if (spouses.length > 0) {
          parts.push(
            `**💍 ${spouses.length === 1 ? "Spouse" : "Spouses"}**\n${(await tagsOf(interaction, spouses)).join("\n")}`,
          );
        }
        if (parents.length > 0) {
          parts.push(
            `**👨‍👩 Parents**\n${(await tagsOf(interaction, parents)).join("\n")}`,
          );
        }
        if (children.length > 0) {
          parts.push(
            `**👶 Children**\n${(await tagsOf(interaction, children)).join("\n")}`,
          );
        }
        if (siblings.length > 0) {
          parts.push(
            `**👫 Siblings**\n${(await tagsOf(interaction, siblings)).join("\n")}`,
          );
        }

        await interaction.reply({
          components: [
            container("#FFD700").addSectionComponents(
              section(parts.join("\n\n"), targetUser.displayAvatarURL()),
            ),
          ],
          flags: V2,
        });
        break;
      }

      case "marry": {
        const targetUser = interaction.options.getUser("user", true);

        if (targetUser.id === interaction.user.id) {
          await interaction.reply({
            content: "**YOU CANNOT MARRY YOURSELF!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const existingMarriage = await FamilyManager.getRelationship(
          interaction.user.id,
          targetUser.id,
          "spouse",
        );

        if (existingMarriage) {
          await interaction.reply({
            content: `**YOU ARE ALREADY MARRIED TO ${targetUser.tag.toUpperCase()}!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const hasExistingRelationship = await FamilyManager.hasRelationship(
          interaction.user.id,
          targetUser.id,
        );
        const existingSpouses = await FamilyManager.getSpouses(
          interaction.user.id,
        );
        const targetSpouses = await FamilyManager.getSpouses(targetUser.id);

        const propose = (followUp: boolean) =>
          sendProposal(interaction, targetUser, followUp, {
            color: "#FF69B4",
            title: "💍 MARRIAGE PROPOSAL",
            body:
              `**${interaction.user.tag}** has proposed marriage to **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept this sacred union?`,
            acceptId: "accept_marriage",
            declineId: "decline_marriage",
            notForYou: "**THIS PROPOSAL IS NOT FOR YOU!**",
            timeoutTitle: "⏱️ PROPOSAL EXPIRED",
            timeoutBody: "The marriage proposal has expired.",
            declineTitle: "💔 PROPOSAL DECLINED",
            declineBody: `**${targetUser.tag}** has declined the marriage proposal.`,
            onAccept: async () => {
              await FamilyManager.addRelationship(
                interaction.user.id,
                targetUser.id,
                "spouse",
                interaction.guildId!,
              );
              return {
                title: "💍 MARRIAGE CEREMONY COMPLETE",
                body:
                  `**${interaction.user.tag}** and **${targetUser.tag}** are now married!\n\n` +
                  `May your union be blessed with eternal happiness! 💕`,
              };
            },
          });

        if (
          hasExistingRelationship ||
          existingSpouses.length > 0 ||
          targetSpouses.length > 0
        ) {
          const warnings: string[] = [];

          if (existingSpouses.length > 0) {
            const spouseUsers = await Promise.all(
              existingSpouses.map((id) => interaction.client.users.fetch(id)),
            );
            const spouseNames = spouseUsers.map((u) => u.tag).join(", ");
            warnings.push(`⚠️ **You are already married to ${spouseNames}!**`);
          }

          if (targetSpouses.length > 0) {
            const targetSpouseUsers = await Promise.all(
              targetSpouses.map((id) => interaction.client.users.fetch(id)),
            );
            const targetSpouseNames = targetSpouseUsers
              .map((u) => u.tag)
              .join(", ");
            warnings.push(
              `⚠️ **${targetUser.tag} is already married to ${targetSpouseNames}!**`,
            );
          }

          if (hasExistingRelationship) {
            warnings.push(
              `⚠️ **You already have a family relationship with ${targetUser.tag}!**`,
            );
          }

          await sendWarningThen(interaction, {
            title: "⚠️ MARRIAGE WARNING",
            body:
              warnings.join("\n\n") +
              "\n\n**This will create a potentially chaotic family tree!**\n\n" +
              "Are you sure you want to proceed?",
            proceedId: "proceed_marry",
            cancelId: "cancel_marry",
            cancelText: "**Marriage proposal cancelled.**",
            sendingText: "**Sending marriage proposal...**",
            sendingColor: "#FF69B4",
            timeoutBody: "Marriage warning timed out.",
            then: () => propose(true),
          });
          return;
        }

        await propose(false);
        break;
      }

      case "divorce": {
        const targetUser = interaction.options.getUser("user", true);

        const spouses = await FamilyManager.getSpouses(interaction.user.id);
        if (!spouses.includes(targetUser.id)) {
          await interaction.reply({
            content: `**${targetUser.tag} IS NOT YOUR SPOUSE!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await sendConfirm(interaction, {
          title: "⚠️ DIVORCE CONFIRMATION",
          body:
            `**${interaction.user.tag}**, are you sure you want to divorce **${targetUser.tag}**?\n\n` +
            `This action will end your marriage.`,
          confirmId: "confirm_divorce",
          confirmLabel: "Confirm Divorce",
          cancelId: "cancel_divorce",
          cancelText: "**Divorce cancelled.**",
          timeoutTitle: "⏱️ REQUEST EXPIRED",
          timeoutBody: "Divorce request timed out.",
          onConfirm: async () => {
            await FamilyManager.removeRelationship(
              interaction.user.id,
              targetUser.id,
              "spouse",
            );
            return {
              title: "💔 DIVORCE FINALIZED",
              body: `**${interaction.user.tag}** and **${targetUser.tag}** are no longer married.`,
            };
          },
        });
        break;
      }

      case "adopt": {
        const targetUser = interaction.options.getUser("user", true);

        if (targetUser.id === interaction.user.id) {
          await interaction.reply({
            content: "**YOU CANNOT ADOPT YOURSELF!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const existingAdoption = await FamilyManager.getRelationship(
          interaction.user.id,
          targetUser.id,
          "parent",
        );

        if (existingAdoption) {
          await interaction.reply({
            content: `**YOU HAVE ALREADY ADOPTED ${targetUser.tag.toUpperCase()}!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const hasExistingRelationship = await FamilyManager.hasRelationship(
          interaction.user.id,
          targetUser.id,
        );

        const propose = (followUp: boolean) =>
          sendProposal(interaction, targetUser, followUp, {
            color: "#87CEEB",
            title: "👶 ADOPTION REQUEST",
            body:
              `**${interaction.user.tag}** wants to adopt **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept?`,
            acceptId: "accept_adoption",
            declineId: "decline_adoption",
            notForYou: "**THIS ADOPTION REQUEST IS NOT FOR YOU!**",
            timeoutTitle: "⏱️ ADOPTION EXPIRED",
            timeoutBody: "The adoption request has expired.",
            declineTitle: "❌ ADOPTION DECLINED",
            declineBody: `**${targetUser.tag}** has declined the adoption request.`,
            onAccept: async () => {
              await FamilyManager.addRelationship(
                interaction.user.id,
                targetUser.id,
                "parent",
                interaction.guildId!,
              );
              return {
                title: "👶 ADOPTION COMPLETE",
                body:
                  `**${interaction.user.tag}** has successfully adopted **${targetUser.tag}**!\n\n` +
                  `Welcome to the family! 👨‍👩‍👧‍👦`,
              };
            },
          });

        if (hasExistingRelationship) {
          await sendWarningThen(interaction, {
            title: "⚠️ ADOPTION WARNING",
            body:
              `⚠️ **You already have a family relationship with ${targetUser.tag}!**\n\n` +
              "**This will create a potentially chaotic family tree!**\n\n" +
              "Are you sure you want to proceed?",
            proceedId: "proceed_adopt",
            cancelId: "cancel_adopt",
            cancelText: "**Adoption request cancelled.**",
            sendingText: "**Sending adoption request...**",
            sendingColor: "#87CEEB",
            timeoutBody: "Adoption warning timed out.",
            then: () => propose(true),
          });
          return;
        }

        await propose(false);
        break;
      }

      case "disown": {
        const targetUser = interaction.options.getUser("user", true);

        const children = await FamilyManager.getChildren(interaction.user.id);
        const parents = await FamilyManager.getParents(interaction.user.id);

        const isChild = children.includes(targetUser.id);
        const isParent = parents.includes(targetUser.id);

        if (!isChild && !isParent) {
          await interaction.reply({
            content: `**${targetUser.tag} IS NOT YOUR CHILD OR PARENT!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const relationshipType = isChild ? "child" : "parent";

        await sendConfirm(interaction, {
          title: "⚠️ DISOWN CONFIRMATION",
          body: `**${interaction.user.tag}**, are you sure you want to disown your ${relationshipType} **${targetUser.tag}**?`,
          confirmId: "confirm_disown",
          confirmLabel: "Confirm",
          cancelId: "cancel_disown",
          cancelText: "**Action cancelled.**",
          timeoutTitle: "⏱️ REQUEST EXPIRED",
          timeoutBody: "Disown request timed out.",
          onConfirm: async () => {
            if (isChild) {
              await FamilyManager.removeRelationship(
                interaction.user.id,
                targetUser.id,
                "parent",
              );
            } else {
              await FamilyManager.removeRelationship(
                targetUser.id,
                interaction.user.id,
                "parent",
              );
            }
            return {
              title: "💔 RELATIONSHIP REMOVED",
              body: `The ${relationshipType} relationship with **${targetUser.tag}** has been removed.`,
            };
          },
        });
        break;
      }

      case "sibling": {
        const targetUser = interaction.options.getUser("user", true);

        if (targetUser.id === interaction.user.id) {
          await interaction.reply({
            content: "**YOU CANNOT BE YOUR OWN SIBLING!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const existingSibling = await FamilyManager.getRelationship(
          interaction.user.id,
          targetUser.id,
          "sibling",
        );

        if (existingSibling) {
          await interaction.reply({
            content: `**YOU ARE ALREADY SIBLINGS WITH ${targetUser.tag.toUpperCase()}!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const hasExistingRelationship = await FamilyManager.hasRelationship(
          interaction.user.id,
          targetUser.id,
        );

        const propose = (followUp: boolean) =>
          sendProposal(interaction, targetUser, followUp, {
            color: "#9370DB",
            title: "👫 SIBLING REQUEST",
            body:
              `**${interaction.user.tag}** wants to be siblings with **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept?`,
            acceptId: "accept_sibling",
            declineId: "decline_sibling",
            notForYou: "**THIS SIBLING REQUEST IS NOT FOR YOU!**",
            timeoutTitle: "⏱️ REQUEST EXPIRED",
            timeoutBody: "The sibling request has expired.",
            declineTitle: "❌ REQUEST DECLINED",
            declineBody: `**${targetUser.tag}** has declined the sibling request.`,
            onAccept: async () => {
              await FamilyManager.addRelationship(
                interaction.user.id,
                targetUser.id,
                "sibling",
                interaction.guildId!,
              );
              return {
                title: "👫 SIBLINGS UNITED",
                body: `**${interaction.user.tag}** and **${targetUser.tag}** are now siblings!`,
              };
            },
          });

        if (hasExistingRelationship) {
          await sendWarningThen(interaction, {
            title: "⚠️ SIBLING WARNING",
            body:
              `⚠️ **You already have a family relationship with ${targetUser.tag}!**\n\n` +
              "**This will create a potentially chaotic family tree!**\n\n" +
              "Are you sure you want to proceed?",
            proceedId: "proceed_sibling",
            cancelId: "cancel_sibling",
            cancelText: "**Sibling request cancelled.**",
            sendingText: "**Sending sibling request...**",
            sendingColor: "#9370DB",
            timeoutBody: "Sibling warning timed out.",
            then: () => propose(true),
          });
          return;
        }

        await propose(false);
        break;
      }

      case "unsibling": {
        const targetUser = interaction.options.getUser("user", true);

        const siblings = await FamilyManager.getSiblings(interaction.user.id);
        if (!siblings.includes(targetUser.id)) {
          await interaction.reply({
            content: `**${targetUser.tag} IS NOT YOUR SIBLING!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await sendConfirm(interaction, {
          title: "⚠️ REMOVE SIBLING",
          body: `**${interaction.user.tag}**, are you sure you want to remove your sibling relationship with **${targetUser.tag}**?`,
          confirmId: "confirm_unsibling",
          confirmLabel: "Confirm",
          cancelId: "cancel_unsibling",
          cancelText: "**Action cancelled.**",
          timeoutTitle: "⏱️ REQUEST EXPIRED",
          timeoutBody: "Unsibling request timed out.",
          onConfirm: async () => {
            await FamilyManager.removeRelationship(
              interaction.user.id,
              targetUser.id,
              "sibling",
            );
            return {
              title: "💔 SIBLING RELATIONSHIP REMOVED",
              body: `You are no longer siblings with **${targetUser.tag}**.`,
            };
          },
        });
        break;
      }
    }
  } catch (error) {
    console.error("Error in family command:", error);
    const content =
      "**AN ERROR OCCURRED WHILE PROCESSING YOUR FAMILY REQUEST!**";
    if (interaction.deferred) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
