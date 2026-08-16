import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
} from "discord.js";
import { FamilyManager } from "../utils/familyManager.js";
import { FamilyTreeRenderer, TreeMember } from "../utils/familyTreeRenderer.js";

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

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "tree": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const graph = await FamilyManager.getFamilyGraph(targetUser.id);

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

        const embed = new EmbedBuilder()
          .setColor("#cdcdcd")
          .setTitle("🌳 FAMILY TREE")
          .setDescription(`**${targetUser.tag}**'s big old family tree!`)
          .setImage("attachment://family-tree.png")
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
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

        const embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("👤 FAMILY PROFILE")
          .setDescription(`Family relationships for **${targetUser.tag}**`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        if (spouses.length > 0) {
          const spouseTags = await Promise.all(
            spouses.map(async (id) => {
              const user = await interaction.client.users.fetch(id);
              return user.tag;
            }),
          );
          embed.addFields({
            name: spouses.length === 1 ? "💍 Spouse" : "💍 Spouses",
            value: spouseTags.join("\n"),
            inline: true,
          });
        }

        if (parents.length > 0) {
          const parentTags = await Promise.all(
            parents.map(async (id) => {
              const user = await interaction.client.users.fetch(id);
              return user.tag;
            }),
          );
          embed.addFields({
            name: "👨‍👩 Parents",
            value: parentTags.join("\n"),
            inline: true,
          });
        }

        if (children.length > 0) {
          const childTags = await Promise.all(
            children.map(async (id) => {
              const user = await interaction.client.users.fetch(id);
              return user.tag;
            }),
          );
          embed.addFields({
            name: "👶 Children",
            value: childTags.join("\n"),
            inline: true,
          });
        }

        if (siblings.length > 0) {
          const siblingTags = await Promise.all(
            siblings.map(async (id) => {
              const user = await interaction.client.users.fetch(id);
              return user.tag;
            }),
          );
          embed.addFields({
            name: "👫 Siblings",
            value: siblingTags.join("\n"),
            inline: true,
          });
        }

        await interaction.reply({ embeds: [embed] });
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

          const confirmRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("proceed_marry")
                .setLabel("Proceed Anyway")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId("cancel_marry")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
            );

          const warningEmbed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("⚠️ MARRIAGE WARNING")
            .setDescription(
              warnings.join("\n\n") +
                "\n\n**This will create a potentially chaotic family tree!**\n\n" +
                "Are you sure you want to proceed?",
            )
            .setTimestamp();

          const warningResponse = await interaction.reply({
            embeds: [warningEmbed],
            components: [confirmRow],
          });

          const warningCollector =
            warningResponse.createMessageComponentCollector({
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

            if (i.customId === "cancel_marry") {
              await i.update({
                content: "**Marriage proposal cancelled.**",
                embeds: [],
                components: [],
              });
              warningCollector.stop();
              return;
            }

            await i.update({
              content: "**Sending marriage proposal...**",
              embeds: [],
              components: [],
            });
            warningCollector.stop();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("accept_marriage")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId("decline_marriage")
                .setLabel("Decline")
                .setStyle(ButtonStyle.Danger),
            );

            const proposalEmbed = new EmbedBuilder()
              .setColor("#FF69B4")
              .setTitle("💍 MARRIAGE PROPOSAL")
              .setDescription(
                `**${interaction.user.tag}** has proposed marriage to **${targetUser.tag}**!\n\n` +
                  `${targetUser.tag}, do you accept this sacred union?`,
              )
              .setTimestamp();

            const response = await interaction.followUp({
              content: `${targetUser}`,
              embeds: [proposalEmbed],
              components: [row],
            });

            const collector = response.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 60000,
            });

            collector.on("collect", async (buttonInteraction) => {
              if (buttonInteraction.user.id !== targetUser.id) {
                await buttonInteraction.reply({
                  content: "**THIS PROPOSAL IS NOT FOR YOU!**",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              if (buttonInteraction.customId === "accept_marriage") {
                await FamilyManager.addRelationship(
                  interaction.user.id,
                  targetUser.id,
                  "spouse",
                  interaction.guildId!,
                );

                const successEmbed = new EmbedBuilder()
                  .setColor("#00FF00")
                  .setTitle("💍 MARRIAGE CEREMONY COMPLETE")
                  .setDescription(
                    `**${interaction.user.tag}** and **${targetUser.tag}** are now married!\n\n` +
                      `May your union be blessed with eternal happiness! 💕`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [successEmbed],
                  components: [],
                });
              } else {
                const declineEmbed = new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("💔 PROPOSAL DECLINED")
                  .setDescription(
                    `**${targetUser.tag}** has declined the marriage proposal.`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [declineEmbed],
                  components: [],
                });
              }

              collector.stop();
            });

            collector.on("end", async (collected) => {
              if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setColor("#808080")
                  .setTitle("⏱️ PROPOSAL EXPIRED")
                  .setDescription("The marriage proposal has expired.")
                  .setTimestamp();

                await response.edit({ embeds: [timeoutEmbed], components: [] });
              }
            });
          });

          warningCollector.on("end", async (collected) => {
            if (collected.size === 0) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor("#808080")
                .setTitle("⏱️ WARNING EXPIRED")
                .setDescription("Marriage warning timed out.")
                .setTimestamp();

              await warningResponse.edit({
                embeds: [timeoutEmbed],
                components: [],
              });
            }
          });

          return;
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("accept_marriage")
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("decline_marriage")
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger),
        );

        const proposalEmbed = new EmbedBuilder()
          .setColor("#FF69B4")
          .setTitle("💍 MARRIAGE PROPOSAL")
          .setDescription(
            `**${interaction.user.tag}** has proposed marriage to **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept this sacred union?`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          content: `${targetUser}`,
          embeds: [proposalEmbed],
          components: [row],
        });

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000,
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== targetUser.id) {
            await i.reply({
              content: "**THIS PROPOSAL IS NOT FOR YOU!**",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (i.customId === "accept_marriage") {
            await FamilyManager.addRelationship(
              interaction.user.id,
              targetUser.id,
              "spouse",
              interaction.guildId!,
            );

            const successEmbed = new EmbedBuilder()
              .setColor("#00FF00")
              .setTitle("💍 MARRIAGE CEREMONY COMPLETE")
              .setDescription(
                `**${interaction.user.tag}** and **${targetUser.tag}** are now married!\n\n` +
                  `May your union be blessed with eternal happiness! 💕`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            const declineEmbed = new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("💔 PROPOSAL DECLINED")
              .setDescription(
                `**${targetUser.tag}** has declined the marriage proposal.`,
              )
              .setTimestamp();

            await i.update({ embeds: [declineEmbed], components: [] });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ PROPOSAL EXPIRED")
              .setDescription("The marriage proposal has expired.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
        });
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_divorce")
            .setLabel("Confirm Divorce")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancel_divorce")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        );

        const confirmEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("⚠️ DIVORCE CONFIRMATION")
          .setDescription(
            `**${interaction.user.tag}**, are you sure you want to divorce **${targetUser.tag}**?\n\n` +
              `This action will end your marriage.`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          embeds: [confirmEmbed],
          components: [row],
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

          if (i.customId === "confirm_divorce") {
            await FamilyManager.removeRelationship(
              interaction.user.id,
              targetUser.id,
              "spouse",
            );

            const successEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("💔 DIVORCE FINALIZED")
              .setDescription(
                `**${interaction.user.tag}** and **${targetUser.tag}** are no longer married.`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            await i.update({
              content: "**Divorce cancelled.**",
              embeds: [],
              components: [],
            });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ REQUEST EXPIRED")
              .setDescription("Divorce request timed out.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
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

        if (hasExistingRelationship) {
          const confirmRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("proceed_adopt")
                .setLabel("Proceed Anyway")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId("cancel_adopt")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
            );

          const warningEmbed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("⚠️ ADOPTION WARNING")
            .setDescription(
              `⚠️ **You already have a family relationship with ${targetUser.tag}!**\n\n` +
                "**This will create a potentially chaotic family tree!**\n\n" +
                "Are you sure you want to proceed?",
            )
            .setTimestamp();

          const warningResponse = await interaction.reply({
            embeds: [warningEmbed],
            components: [confirmRow],
          });

          const warningCollector =
            warningResponse.createMessageComponentCollector({
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

            if (i.customId === "cancel_adopt") {
              await i.update({
                content: "**Adoption request cancelled.**",
                embeds: [],
                components: [],
              });
              warningCollector.stop();
              return;
            }

            await i.update({
              content: "**Sending adoption request...**",
              embeds: [],
              components: [],
            });
            warningCollector.stop();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("accept_adoption")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId("decline_adoption")
                .setLabel("Decline")
                .setStyle(ButtonStyle.Danger),
            );

            const adoptionEmbed = new EmbedBuilder()
              .setColor("#87CEEB")
              .setTitle("👶 ADOPTION REQUEST")
              .setDescription(
                `**${interaction.user.tag}** wants to adopt **${targetUser.tag}**!\n\n` +
                  `${targetUser.tag}, do you accept?`,
              )
              .setTimestamp();

            const response = await interaction.followUp({
              content: `${targetUser}`,
              embeds: [adoptionEmbed],
              components: [row],
            });

            const collector = response.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 60000,
            });

            collector.on("collect", async (buttonInteraction) => {
              if (buttonInteraction.user.id !== targetUser.id) {
                await buttonInteraction.reply({
                  content: "**THIS ADOPTION REQUEST IS NOT FOR YOU!**",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              if (buttonInteraction.customId === "accept_adoption") {
                await FamilyManager.addRelationship(
                  interaction.user.id,
                  targetUser.id,
                  "parent",
                  interaction.guildId!,
                );

                const successEmbed = new EmbedBuilder()
                  .setColor("#00FF00")
                  .setTitle("👶 ADOPTION COMPLETE")
                  .setDescription(
                    `**${interaction.user.tag}** has successfully adopted **${targetUser.tag}**!\n\n` +
                      `Welcome to the family! 👨‍👩‍👧‍👦`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [successEmbed],
                  components: [],
                });
              } else {
                const declineEmbed = new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("❌ ADOPTION DECLINED")
                  .setDescription(
                    `**${targetUser.tag}** has declined the adoption request.`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [declineEmbed],
                  components: [],
                });
              }

              collector.stop();
            });

            collector.on("end", async (collected) => {
              if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setColor("#808080")
                  .setTitle("⏱️ ADOPTION EXPIRED")
                  .setDescription("The adoption request has expired.")
                  .setTimestamp();

                await response.edit({ embeds: [timeoutEmbed], components: [] });
              }
            });
          });

          warningCollector.on("end", async (collected) => {
            if (collected.size === 0) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor("#808080")
                .setTitle("⏱️ WARNING EXPIRED")
                .setDescription("Adoption warning timed out.")
                .setTimestamp();

              await warningResponse.edit({
                embeds: [timeoutEmbed],
                components: [],
              });
            }
          });

          return;
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("accept_adoption")
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("decline_adoption")
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger),
        );

        const adoptionEmbed = new EmbedBuilder()
          .setColor("#87CEEB")
          .setTitle("👶 ADOPTION REQUEST")
          .setDescription(
            `**${interaction.user.tag}** wants to adopt **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept?`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          content: `${targetUser}`,
          embeds: [adoptionEmbed],
          components: [row],
        });

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000,
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== targetUser.id) {
            await i.reply({
              content: "**THIS ADOPTION REQUEST IS NOT FOR YOU!**",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (i.customId === "accept_adoption") {
            await FamilyManager.addRelationship(
              interaction.user.id,
              targetUser.id,
              "parent",
              interaction.guildId!,
            );

            const successEmbed = new EmbedBuilder()
              .setColor("#00FF00")
              .setTitle("👶 ADOPTION COMPLETE")
              .setDescription(
                `**${interaction.user.tag}** has successfully adopted **${targetUser.tag}**!\n\n` +
                  `Welcome to the family! 👨‍👩‍👧‍👦`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            const declineEmbed = new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ ADOPTION DECLINED")
              .setDescription(
                `**${targetUser.tag}** has declined the adoption request.`,
              )
              .setTimestamp();

            await i.update({ embeds: [declineEmbed], components: [] });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ ADOPTION EXPIRED")
              .setDescription("The adoption request has expired.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
        });
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_disown")
            .setLabel("Confirm")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancel_disown")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        );

        const relationshipType = isChild ? "child" : "parent";
        const confirmEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("⚠️ DISOWN CONFIRMATION")
          .setDescription(
            `**${interaction.user.tag}**, are you sure you want to disown your ${relationshipType} **${targetUser.tag}**?`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          embeds: [confirmEmbed],
          components: [row],
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

          if (i.customId === "confirm_disown") {
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

            const successEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("💔 RELATIONSHIP REMOVED")
              .setDescription(
                `The ${relationshipType} relationship with **${targetUser.tag}** has been removed.`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            await i.update({
              content: "**Action cancelled.**",
              embeds: [],
              components: [],
            });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ REQUEST EXPIRED")
              .setDescription("Disown request timed out.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
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

        if (hasExistingRelationship) {
          const confirmRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("proceed_sibling")
                .setLabel("Proceed Anyway")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId("cancel_sibling")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
            );

          const warningEmbed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("⚠️ SIBLING WARNING")
            .setDescription(
              `⚠️ **You already have a family relationship with ${targetUser.tag}!**\n\n` +
                "**This will create a potentially chaotic family tree!**\n\n" +
                "Are you sure you want to proceed?",
            )
            .setTimestamp();

          const warningResponse = await interaction.reply({
            embeds: [warningEmbed],
            components: [confirmRow],
          });

          const warningCollector =
            warningResponse.createMessageComponentCollector({
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

            if (i.customId === "cancel_sibling") {
              await i.update({
                content: "**Sibling request cancelled.**",
                embeds: [],
                components: [],
              });
              warningCollector.stop();
              return;
            }

            await i.update({
              content: "**Sending sibling request...**",
              embeds: [],
              components: [],
            });
            warningCollector.stop();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("accept_sibling")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId("decline_sibling")
                .setLabel("Decline")
                .setStyle(ButtonStyle.Danger),
            );

            const siblingEmbed = new EmbedBuilder()
              .setColor("#9370DB")
              .setTitle("👫 SIBLING REQUEST")
              .setDescription(
                `**${interaction.user.tag}** wants to be siblings with **${targetUser.tag}**!\n\n` +
                  `${targetUser.tag}, do you accept?`,
              )
              .setTimestamp();

            const response = await interaction.followUp({
              content: `${targetUser}`,
              embeds: [siblingEmbed],
              components: [row],
            });

            const collector = response.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 60000,
            });

            collector.on("collect", async (buttonInteraction) => {
              if (buttonInteraction.user.id !== targetUser.id) {
                await buttonInteraction.reply({
                  content: "**THIS SIBLING REQUEST IS NOT FOR YOU!**",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              if (buttonInteraction.customId === "accept_sibling") {
                await FamilyManager.addRelationship(
                  interaction.user.id,
                  targetUser.id,
                  "sibling",
                  interaction.guildId!,
                );

                const successEmbed = new EmbedBuilder()
                  .setColor("#00FF00")
                  .setTitle("👫 SIBLINGS UNITED")
                  .setDescription(
                    `**${interaction.user.tag}** and **${targetUser.tag}** are now siblings!`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [successEmbed],
                  components: [],
                });
              } else {
                const declineEmbed = new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("❌ REQUEST DECLINED")
                  .setDescription(
                    `**${targetUser.tag}** has declined the sibling request.`,
                  )
                  .setTimestamp();

                await buttonInteraction.update({
                  embeds: [declineEmbed],
                  components: [],
                });
              }

              collector.stop();
            });

            collector.on("end", async (collected) => {
              if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setColor("#808080")
                  .setTitle("⏱️ REQUEST EXPIRED")
                  .setDescription("The sibling request has expired.")
                  .setTimestamp();

                await response.edit({ embeds: [timeoutEmbed], components: [] });
              }
            });
          });

          warningCollector.on("end", async (collected) => {
            if (collected.size === 0) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor("#808080")
                .setTitle("⏱️ WARNING EXPIRED")
                .setDescription("Sibling warning timed out.")
                .setTimestamp();

              await warningResponse.edit({
                embeds: [timeoutEmbed],
                components: [],
              });
            }
          });

          return;
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("accept_sibling")
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("decline_sibling")
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger),
        );

        const siblingEmbed = new EmbedBuilder()
          .setColor("#9370DB")
          .setTitle("👫 SIBLING REQUEST")
          .setDescription(
            `**${interaction.user.tag}** wants to be siblings with **${targetUser.tag}**!\n\n` +
              `${targetUser.tag}, do you accept?`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          content: `${targetUser}`,
          embeds: [siblingEmbed],
          components: [row],
        });

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000,
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== targetUser.id) {
            await i.reply({
              content: "**THIS SIBLING REQUEST IS NOT FOR YOU!**",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (i.customId === "accept_sibling") {
            await FamilyManager.addRelationship(
              interaction.user.id,
              targetUser.id,
              "sibling",
              interaction.guildId!,
            );

            const successEmbed = new EmbedBuilder()
              .setColor("#00FF00")
              .setTitle("👫 SIBLINGS UNITED")
              .setDescription(
                `**${interaction.user.tag}** and **${targetUser.tag}** are now siblings!`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            const declineEmbed = new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ REQUEST DECLINED")
              .setDescription(
                `**${targetUser.tag}** has declined the sibling request.`,
              )
              .setTimestamp();

            await i.update({ embeds: [declineEmbed], components: [] });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ REQUEST EXPIRED")
              .setDescription("The sibling request has expired.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
        });
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_unsibling")
            .setLabel("Confirm")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancel_unsibling")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        );

        const confirmEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("⚠️ REMOVE SIBLING")
          .setDescription(
            `**${interaction.user.tag}**, are you sure you want to remove your sibling relationship with **${targetUser.tag}**?`,
          )
          .setTimestamp();

        const response = await interaction.reply({
          embeds: [confirmEmbed],
          components: [row],
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

          if (i.customId === "confirm_unsibling") {
            await FamilyManager.removeRelationship(
              interaction.user.id,
              targetUser.id,
              "sibling",
            );

            const successEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("💔 SIBLING RELATIONSHIP REMOVED")
              .setDescription(
                `You are no longer siblings with **${targetUser.tag}**.`,
              )
              .setTimestamp();

            await i.update({ embeds: [successEmbed], components: [] });
          } else {
            await i.update({
              content: "**Action cancelled.**",
              embeds: [],
              components: [],
            });
          }

          collector.stop();
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor("#808080")
              .setTitle("⏱️ REQUEST EXPIRED")
              .setDescription("Unsibling request timed out.")
              .setTimestamp();

            await response.edit({ embeds: [timeoutEmbed], components: [] });
          }
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
