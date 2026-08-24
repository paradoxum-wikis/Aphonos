import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  generateFighter,
  calculateAuraPercentage,
  calculateAuraLevel,
} from "../utils/fighterGenerator.js";

// prettier-ignore
const auraLevelNames = [
  "Vile",        // 0
  "Invisible",   // 1
  "Weak",        // 2
  "Frail",       // 3
  "Mid",         // 4
  "Noticed",     // 5
  "Vibrant",     // 6
  "Strong",      // 7
  "Radiant",     // 8
  "Legendary",   // 9
  "Mythical",    // 10
  "Omnipotent",  // 11
];

const flavorSet1 = [
  "An aura so cursed, even homeless bums avoid you!",
  "Your aura is basically nonexistent. NPC energy.",
  "Your vibe is weak. People forget you exist mid-conversation.",
  "You got potential, but right now you're background noise.",
  "Decent energy, but still kinda mid. Try harder.",
  "Solid aura, people actually notice you.",
  "A vibrant aura, in harmony with the egoistic tides.",
  "Strong aura, like a maxxed Minigunner under DJ buff.",
  "You light up the room. Everyone wants you on their team.",
  "A divinelike presence, bending the fabric of reality.",
  "A legendary aura, echoing through the cosmos eternally.",
  "Your presence is truly, truly unmatched.",
];

const flavorSet2 = [
  "Your presence is weaker than your dad's commitment.",
  "Please go, you're making the room uncomfortable.",
  "Your aura is so weak, even the Normals avoid you.",
  "Barely a vibe, as if you fell down a 4 person tall staircase.",
  "You're like a level 5 Pyromancer on Wave 40—absolutely useless and proud of it.",
  "You've got presence. Not loud, but respected.",
  "Nice aura, Ego would probably approve.",
  "Radiant energy, the alters are envious.",
  "You walk in, and the atmosphere changes. Eyes turn.",
  "Near-mythical aura, you're as lethal as King Von.",
  "God-tier vibes, I'd rub your feet.",
  "Paradoxically omnipotent. Are you Ego himself?",
];

const flavorSets = [flavorSet1, flavorSet2];

export const data = new SlashCommandBuilder()
  .setName("aura")
  .setDescription(
    "Calculate aura and fighter stats based on one's display name",
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Ping a user to read their aura")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  let displayName: string;

  if (interaction.inGuild()) {
    const member = await interaction.guild!.members.fetch(targetUser.id);
    displayName = member.displayName;
  } else {
    displayName = targetUser.username;
  }

  const percentage = calculateAuraPercentage(displayName);
  const level = calculateAuraLevel(percentage);
  const fighter = generateFighter(targetUser, displayName);

  const chosenSet = flavorSets[Math.floor(Math.random() * flavorSets.length)];
  const flavorText =
    chosenSet[Math.max(0, Math.min(level, chosenSet.length - 1))];

  const levelName =
    auraLevelNames[Math.max(0, Math.min(level, auraLevelNames.length - 1))];

  const embed = new EmbedBuilder()
    .setColor(level === 0 ? "#2F2F2F" : level === 11 ? "#ad32ff" : "#800080")
    .setTitle("🔮 Aura Reading")
    .setURL("https://alterego.wiki/Help:ALTERSHAPER/Aura")
    .setDescription(`The mystical aura of **${displayName}** has been divined!`)
    .addFields(
      { name: "🌟 Aura Strength", value: `${percentage}%`, inline: true },
      { name: "📊 Aura Level", value: `${level} (${levelName})`, inline: true },
      { name: "⚔️ Fighter Class", value: getFighterClass(level), inline: true },
      {
        name: "💪 Combat Statistics",
        value:
          `**HP:** ${fighter.hp}\n` +
          `**ATK:** ${fighter.attack}\n` +
          `**DEF:** ${fighter.defense}\n` +
          `**SPD:** ${fighter.speed}\n` +
          `**CRIT:** ${Math.round(fighter.critChance * 100)}%`,
        inline: true,
      },
      {
        name: "🎯 Special Abilities",
        value: `• ${fighter.abilities[0]}\n• ${fighter.abilities[1]}`,
        inline: true,
      },
      { name: "📝 Verdict", value: flavorText, inline: false },
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: "Aura levels may vary based on cosmic vibrations." })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

function getFighterClass(level: number): string {
  if (level === 0) return "Cursed Bum";
  if (level <= 2) return "Recruit";
  if (level <= 4) return "Hardened Fighter";
  if (level <= 6) return "Decimator";
  if (level <= 8) return "Egoistic Champion";
  if (level <= 10) return "Living Weapon";
  return "Ego's Chosen One";
}
