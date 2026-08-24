import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Initiate a divine distribution of gifts")
  .addStringOption((option) =>
    option
      .setName("prize")
      .setDescription("The sacred relic to be bestowed")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("days")
      .setDescription("Duration of the gathering in days")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(7),
  )
  .addIntegerOption((option) =>
    option
      .setName("hours")
      .setDescription("Duration of the gathering in hours")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(168),
  )
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setDescription("Duration of the gathering in minutes")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(10080),
  )
  .addIntegerOption((option) =>
    option
      .setName("winners")
      .setDescription("Number of chosen souls")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const prize = interaction.options.getString("prize")!;

  const days = interaction.options.getInteger("days") ?? 0;
  const hours = interaction.options.getInteger("hours") ?? 0;
  const minutes = interaction.options.getInteger("minutes") ?? 0;

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

  if (totalMinutes < 1) {
    await interaction.reply({
      content:
        "**THOU MUST DECLARE A DURATION!** Provide at least 1 minute (days/hours/minutes).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const winnerCount = interaction.options.getInteger("winners") || 1;
  const durationMs = totalMinutes * 60 * 1000;
  const endTime = new Date(Date.now() + durationMs);
  const endStamp = `<t:${Math.floor(endTime.getTime() / 1000)}:R>`;

  const joinButton = new ButtonBuilder()
    .setCustomId("giveaway_join")
    .setLabel("Seek Favor")
    .setEmoji("🎁")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

  const message = await interaction.reply({
    components: [
      container("#FFD700")
        .addTextDisplayComponents(
          text(
            `## 🎉 GIVEAWAY INITIATED\n**Aphonos has authorized a distribution of wealth!**\n\n**🎁 PRIZE:** ${prize}\n**👑 HOST:** ${executor}\n**🏆 WINNERS:** ${winnerCount}\n**⏰ ENDS:** ${endStamp}\n\n**INSTRUCTIONS**\nPress the button below to enter the sacred lottery! (Press again to withdraw)\n\n-# May Aphonos guide fortune to the worthy.`,
          ),
        )
        .addActionRowComponents(row),
    ],
    flags: V2,
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: durationMs,
  });

  const participants = new Set<string>();

  collector.on("collect", async (i) => {
    if (i.customId === "giveaway_join") {
      if (participants.has(i.user.id)) {
        participants.delete(i.user.id);
        await i.reply({
          content: "**THOU HAST WITHDRAWN FROM THE SACRED LOTTERY!**",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        participants.add(i.user.id);
        await i.reply({
          content: "**THOU HAST BEEN REGISTERED!** May fortune favor thee.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });

  collector.on("end", async () => {
    const disabledButton = new ButtonBuilder()
      .setCustomId("giveaway_join_ended")
      .setLabel("Giveaway Ended")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      disabledButton,
    );

    const participantArray = Array.from(participants);
    const winners: string[] = [];
    const header = `**Aphonos has authorized a distribution of wealth!**\n\n**🎁 PRIZE:** ${prize}\n**👑 HOST:** ${executor}\n**🏆 WINNERS:** ${winnerCount}\n**⏰ ENDED:** ${endStamp}`;

    if (participantArray.length === 0) {
      await message.edit({
        components: [
          container("#FF0000")
            .addTextDisplayComponents(
              text(
                `## 🎉 GIVEAWAY CONCLUDED\n${header}\n\n**😔 RESULT:** No souls sought favor.`,
              ),
            )
            .addActionRowComponents(disabledRow),
        ],
        flags: V2,
      });

      await message.reply({
        content: `**THE GIVEAWAY FOR "${prize}" HAS ENDED!**\nSadly, no one participated.`,
      });
    } else {
      for (let i = 0; i < winnerCount && participantArray.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * participantArray.length);
        winners.push(participantArray[randomIndex]);
        participantArray.splice(randomIndex, 1);
      }

      const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");

      await message.edit({
        components: [
          container("#00FF00")
            .addTextDisplayComponents(
              text(
                `## 🎉 GIVEAWAY CONCLUDED\n${header}\n\n**🎉 WINNERS:** ${winnerMentions}`,
              ),
            )
            .addActionRowComponents(disabledRow),
        ],
        flags: V2,
      });

      await message.reply({
        content: `**🎉 THE DIVINE DISTRIBUTION IS COMPLETE!**\n\nCongratulations to the chosen souls: ${winnerMentions}\nThey have won: **${prize}**`,
      });
    }
  });
}
