import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

const responses = [
  "The divine winds favor thee.",
  "Alteruism shines upon thy path.",
  "The sacred halls echo with certainty.",
  "The oracles decree: Yes.",
  "Thy fate is entwined with righteousness.",
  "The answer is most likely.",
  "The spirits whisper: Outlook good.",
  "The sacred flame burns with hope.",
  "The answer is yes.",
  "Signs point to divine approval.",
  "The mists of fate cloud the answer. Try again.",
  "The oracles are silent. Ask again later.",
  "The oracle withholds judgment for now.",
  "The future is veiled. Cannot predict now.",
  "Focus thy alter ego and ask once more.",
  "Do not count on it.",
  "The sacred decree is no.",
  "The spirits say nay.",
  "The omens are not favorable.",
  "The oracle is doubtful of thy request.",
];

export const data = new SlashCommandBuilder()
  .setName("oracle")
  .setDescription("Consult the oracles for divine wisdom")
  .addStringOption((option) =>
    option
      .setName("question")
      .setDescription("The question to ask the oracles")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const questionRaw = interaction.options.getString("question");
  const question = questionRaw
    ? questionRaw.slice(0, 1024)
    : "No question provided.";
  const response = responses[Math.floor(Math.random() * responses.length)];

  const embed = new EmbedBuilder()
    .setColor("#2E2B5F")
    .setTitle("🎱 THE ORACLE")
    .setDescription("**Seek the wisdom of the oracles!**")
    .addFields(
      { name: "Thy Query", value: `"${question}"`, inline: false },
      { name: "The Oracle's Decree", value: `**${response}**`, inline: false },
    )
    .setFooter({ text: "Their words are truth." })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
