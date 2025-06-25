// ====== DISCORD STORE BOT SEDERHANA (PERSISTENT STORAGE, RAILWAY READY) ======
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

// === Cek environment variable (Railway/Heroku style) ===
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ALLOWED_CATEGORY_ID = process.env.ALLOWED_CATEGORY_ID; // Set di Railway/ENV
let ADMINS = process.env.ADMINS?.split(",") || []; // Comma separated user ids

const PRODUK_FILE = "produk.json";
let categories = {};
let lastId = 0;

// Persistent storage
function loadProduk() {
  if (fs.existsSync(PRODUK_FILE)) {
    const data = fs.readFileSync(PRODUK_FILE, "utf-8");
    const obj = JSON.parse(data);
    categories = obj.categories || {};
    lastId = obj.lastId || 0;
  }
}
function saveProduk() {
  fs.writeFileSync(PRODUK_FILE, JSON.stringify({ categories, lastId }, null, 2));
}
loadProduk();

// Forbidden word filter (WAJIB pakai untuk keamanan)
const forbiddenWords = [
  "palestinian", "palestinians", "nazi", "jew", "hitler", "nsdap", "behead", "crucify", "holocaust", "gas chamber", "trashcan",
  "liquefy", "defecate", "trash", "exterminate", "eat", "dissect", "stir-fry", "karate chop", "curb stomp", "wood chipper", "acid", "genocide",
  "bunuh", "bakar", "mati", "pembantaian", "ras", "agama", "kafir", "teroris", "bom", "anjing", "babi", "kill", "dead"
];
function containsForbidden(text) {
  if (!text) return false;
  const low = text.toLowerCase();
  return forbiddenWords.some(w => low.includes(w));
}

// Format rupiah
function formatRupiah(angka) {
  return angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Commands
const commands = [
  new SlashCommandBuilder().setName("store").setDescription("Melihat daftar kategori produk"),
  new SlashCommandBuilder().setName("list").setDescription("Melihat produk dalam kategori")
    .addStringOption((option) => option.setName("kategori").setDescription("Nama kategori").setRequired(true)),
  new SlashCommandBuilder().setName("detail").setDescription("Lihat detail produk")
    .addIntegerOption((option) => option.setName("id").setDescription("ID produk").setRequired(true)),
  new SlashCommandBuilder().setName("additem").setDescription("Tambah produk baru (admin only)")
    .addStringOption((option) => option.setName("kategori").setDescription("Kategori produk").setRequired(true))
    .addStringOption((option) => option.setName("nama").setDescription("Nama produk").setRequired(true))
    .addIntegerOption((option) => option.setName("harga").setDescription("Harga produk").setRequired(true))
    .addStringOption((option) => option.setName("deskripsi").setDescription("Deskripsi produk").setRequired(true)),
  new SlashCommandBuilder().setName("order").setDescription("Order produk")
    .addIntegerOption((option) => option.setName("id").setDescription("ID produk").setRequired(true)),
  new SlashCommandBuilder().setName("hapusproduk").setDescription("Hapus produk satu persatu (admin only)")
    .addStringOption((option) => option.setName("kategori").setDescription("Nama kategori produk").setRequired(true))
    .addIntegerOption((option) => option.setName("id").setDescription("ID produk yang ingin dihapus").setRequired(false))
    .addStringOption((option) => option.setName("nama").setDescription("Nama produk yang ingin dihapus").setRequired(false)),
  new SlashCommandBuilder().setName("editproduk").setDescription("Edit produk (admin only, HARUS pilih id/namalama, jika kosong muncul list produk)")
    .addStringOption((option) => option.setName("kategori").setDescription("Nama kategori produk").setRequired(true))
    .addIntegerOption((option) => option.setName("id").setDescription("ID produk yang ingin diedit").setRequired(false))
    .addStringOption((option) => option.setName("namalama").setDescription("Nama produk yang ingin diedit").setRequired(false))
    .addStringOption((option) => option.setName("nama").setDescription("Nama produk baru").setRequired(false))
    .addIntegerOption((option) => option.setName("harga").setDescription("Harga produk baru").setRequired(false))
    .addStringOption((option) => option.setName("deskripsi").setDescription("Deskripsi produk baru").setRequired(false)),
  new SlashCommandBuilder().setName("resetproduk").setDescription("Reset (hapus) semua produk di seluruh kategori (admin only)"),
  new SlashCommandBuilder().setName("topup").setDescription("Mulai proses topup dengan pilih kategori secara interaktif"),
  new SlashCommandBuilder().setName("addadmin").setDescription("Menambah user admin bot (super admin only)")
    .addUserOption((option) => option.setName("user").setDescription("User yang akan dijadikan admin").setRequired(true)),
  new SlashCommandBuilder().setName("say").setDescription("Owner bot: Kirim pesan sebagai bot ke channel ini")
    .addStringOption((option) => option.setName("pesan").setDescription("Isi pesan yang akan dikirim").setRequired(true)),
].map((cmd) => cmd.toJSON());

// Register commands
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Semua slash command didaftarkan!");
  } catch (error) {
    console.error(error);
  }
})();

// Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.on("ready", () => {
  console.log(`Bot aktif sebagai ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName, options, user, channel } = interaction;
    const isAdmin = ADMINS.includes(user.id);
    const isOwner = user.id === ADMINS[0];

    // Batasi command pelanggan hanya di kategori tertentu, admin bisa di mana saja
    const customerCommands = ["store", "list", "detail", "order", "topup"];
    if (customerCommands.includes(commandName)) {
      if (!isAdmin) {
        const allowedTypes = [0, 10, 11, 12];
        if (!channel || !allowedTypes.includes(channel.type)) {
          return await interaction.reply({
            content: "❌ Command ini hanya bisa digunakan di channel text atau thread pada server.",
            ephemeral: true,
          });
        }
        let parentCategory = null;
        if ([10, 11, 12].includes(channel.type)) {
          const parentChannel = await channel.guild.channels.fetch(channel.parentId);
          parentCategory = parentChannel ? parentChannel.parent : null;
        } else {
          parentCategory = channel.parent || null;
        }
        if (!parentCategory) {
          return await interaction.reply({
            content: `❌ Channel ini tidak berada dalam kategori apapun. Gunakan command di channel dalam kategori yang diizinkan.`,
            ephemeral: true,
          });
        }
        if (String(parentCategory.id) !== String(ALLOWED_CATEGORY_ID)) {
          return await interaction.reply({
            content: `❌ Command ini hanya bisa digunakan ketika anda melakukan topup.`,
            ephemeral: true,
          });
        }
      }
    }

    // Handler command
    if (commandName === "store") {
      let txt = "**📦 KATEGORI PRODUK:**\n";
      txt += Object.keys(categories).map((k, i) => `${i + 1}. ${k}`).join("\n");
      txt += `\nGunakan \`/list kategori:<nama_kategori>\` untuk melihat produk dalam kategori.`;
      await interaction.reply(txt);
    } else if (commandName === "list") {
      const kategori = options.getString("kategori").toLowerCase();
      if (!categories[kategori] || categories[kategori].length === 0)
        return await interaction.reply("Kategori tidak ditemukan atau kosong.");
      let txt = `**🛒 LIST PRODUK KATEGORI: ${kategori.toUpperCase()}**\n`;
      categories[kategori].forEach((item) => {
        txt += `**[${item.id}] ${item.name}** - Rp${formatRupiah(item.price)}\n`;
      });
      txt += `\nGunakan \`/detail id:<id>\` untuk lihat detail barang.`;
      await interaction.reply(txt);
    } else if (commandName === "detail") {
      const id = options.getInteger("id");
      let item = null;
      for (let arr of Object.values(categories)) {
        let found = arr.find((i) => i.id === id);
        if (found) {
          item = found;
          break;
        }
      }
      if (!item) return await interaction.reply("Barang tidak ditemukan.");
      await interaction.reply(
        `**${item.name}**\nHarga: Rp${formatRupiah(item.price)}\nDeskripsi: ${item.desc}`,
      );
    } else if (commandName === "additem") {
      if (!isAdmin)
        return await interaction.reply("Hanya admin yang bisa menambah produk.");
      const kategori = options.getString("kategori").toLowerCase();
      const name = options.getString("nama");
      const price = options.getInteger("harga");
      const desc = options.getString("deskripsi");
      // Filter forbidden words
      if (containsForbidden(name) || containsForbidden(desc)) {
        return await interaction.reply({
          content: "❌ Nama atau deskripsi produk mengandung kata terlarang/SARA. Tidak boleh ditambahkan.",
          ephemeral: true,
        });
      }
      lastId += 1;
      if (!categories[kategori]) categories[kategori] = [];
      categories[kategori].push({ id: lastId, name, price, desc });
      saveProduk();
      await interaction.reply("Barang berhasil ditambah.");
    } else if (commandName === "order") {
      const id = options.getInteger("id");
      let item = null;
      for (let arr of Object.values(categories)) {
        let found = arr.find((i) => i.id === id);
        if (found) {
          item = found;
          break;
        }
      }
      if (!item) return await interaction.reply("Barang tidak ditemukan.");
      await interaction.reply(
        `Order: **${item.name}**\nSilakan DM admin untuk transaksi.`,
      );
    } else if (commandName === "resetproduk") {
      if (!isAdmin)
        return await interaction.reply("Hanya admin yang bisa mereset produk!");
      categories = {};
      lastId = 0;
      saveProduk();
      await interaction.reply("Semua kategori dan produk berhasil direset (dihapus).");
    } else if (commandName === "hapusproduk") {
      if (!isAdmin)
        return await interaction.reply("Hanya admin yang bisa menghapus produk!");
      const kategori = options.getString("kategori").toLowerCase();
      const id = options.getInteger("id");
      const nama = options.getString("nama");
      if (!categories[kategori] || categories[kategori].length === 0)
        return await interaction.reply("Kategori tidak ditemukan atau kosong.");
      if (!id && !nama) {
        let txt = `**Daftar produk kategori \`${kategori}\`:**\n`;
        categories[kategori].forEach((item) => {
          txt += `ID: ${item.id} | Nama: ${item.name} | Harga: Rp${formatRupiah(item.price)}\n`;
        });
        txt += "\nSilakan jalankan ulang perintah `/hapusproduk` dengan ID atau nama produk!";
        return await interaction.reply(txt);
      }
      let before = categories[kategori].length;
      let after = before;
      let hapusBy = "";
      if (id) {
        categories[kategori] = categories[kategori].filter((item) => item.id !== id);
        hapusBy = `ID ${id}`;
      } else if (nama) {
        categories[kategori] = categories[kategori].filter((item) => item.name.toLowerCase() !== nama.toLowerCase());
        hapusBy = `nama "${nama}"`;
      }
      after = categories[kategori].length;
      if (after === before)
        return await interaction.reply("Produk tidak ditemukan dalam kategori tersebut.");
      saveProduk();
      await interaction.reply(`Produk dengan ${hapusBy} berhasil dihapus dari kategori ${kategori}.`);
    } else if (commandName === "editproduk") {
      if (!isAdmin)
        return await interaction.reply("Hanya admin yang bisa edit produk!");
      const kategori = options.getString("kategori").toLowerCase();
      const id = options.getInteger("id");
      const namalama = options.getString("namalama");
      const namaBaru = options.getString("nama");
      const hargaBaru = options.getInteger("harga");
      const descBaru = options.getString("deskripsi");
      if (!categories[kategori] || categories[kategori].length === 0)
        return await interaction.reply("Kategori tidak ditemukan atau kosong.");
      if (!id && !namalama) {
        let txt = `**Daftar produk kategori \`${kategori}\`:**\n`;
        categories[kategori].forEach((item) => {
          txt += `ID: ${item.id} | Nama: ${item.name} | Harga: Rp${formatRupiah(item.price)}\n`;
        });
        txt += "\nSilakan jalankan ulang perintah `/editproduk` dengan ID atau nama produk yang ingin diedit!";
        return await interaction.reply(txt);
      }
      if (!namaBaru && !hargaBaru && !descBaru) {
        return await interaction.reply(
          "Minimal isi salah satu opsi yang ingin diubah (nama, harga, atau deskripsi)!");
      }
      let produk;
      if (id) {
        produk = categories[kategori].find((item) => item.id === id);
      } else if (namalama) {
        produk = categories[kategori].find((item) => item.name.toLowerCase() === namalama.toLowerCase());
      }
      if (!produk)
        return await interaction.reply("Produk tidak ditemukan dalam kategori tersebut.");
      // Filter forbidden words
      if ((namaBaru && containsForbidden(namaBaru)) || (descBaru && containsForbidden(descBaru))) {
        return await interaction.reply({
          content: "❌ Nama/deskripsi produk baru mengandung kata terlarang/SARA. Tidak boleh diedit.",
          ephemeral: true,
        });
      }
      if (namaBaru) produk.name = namaBaru;
      if (hargaBaru) produk.price = hargaBaru;
      if (descBaru) produk.desc = descBaru;
      saveProduk();
      await interaction.reply(`Produk "${produk.name}" pada kategori ${kategori} berhasil diedit.`);
    } else if (commandName === "addadmin") {
      if (!isOwner)
        return await interaction.reply("Hanya super admin yang bisa menambah admin baru!");
      const target = options.getUser("user");
      if (!target) return await interaction.reply("User tidak ditemukan.");
      if (ADMINS.includes(target.id))
        return await interaction.reply("User tersebut sudah menjadi admin.");
      ADMINS.push(target.id);
      await interaction.reply(`Berhasil menambah <@${target.id}> sebagai admin bot!`);
    } else if (commandName === "topup") {
      const rows = [];
      let row = new ActionRowBuilder();
      let i = 0;
      for (const kategori of Object.keys(categories)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`topup_kategori_${kategori}`)
            .setLabel(kategori)
            .setStyle(ButtonStyle.Primary),
        );
        i++;
        if (i % 5 === 0) {
          rows.push(row);
          row = new ActionRowBuilder();
        }
      }
      if (row.components.length > 0) rows.push(row);
      await interaction.reply({
        content: "Pilih kategori produk:",
        components: rows,
        ephemeral: !isAdmin,
      });
    } else if (commandName === "say") {
      if (!isOwner) {
        return await interaction.reply({
          content: "❌ Perintah ini hanya bisa digunakan oleh Owner bot!",
          ephemeral: true,
        });
      }
      const pesan = options.getString("pesan");
      // Filter forbidden words
      if (containsForbidden(pesan)) {
        return await interaction.reply({
          content: "❌ Pesan mengandung kata terlarang/SARA. Tidak boleh dikirim.",
          ephemeral: true,
        });
      }
      await interaction.reply({
        content: "Pesan berhasil dikirim.",
        ephemeral: true,
      });
      await interaction.channel.send(pesan);
    }
  } else if (interaction.isButton()) {
    const parts = interaction.customId.split("_");
    if (parts[0] === "topup" && parts[1] === "kategori") {
      const kategori = parts.slice(2).join("_");
      const produkList = categories[kategori];
      if (!produkList || produkList.length === 0)
        return await interaction.reply({
          content: "Kategori kosong!",
          ephemeral: true,
        });
      const rows = [];
      let row = new ActionRowBuilder();
      let i = 0;
      for (const produk of produkList) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`topup_produk_${kategori}_${produk.id}`)
            .setLabel(produk.name)
            .setStyle(ButtonStyle.Secondary),
        );
        i++;
        if (i % 5 === 0) {
          rows.push(row);
          row = new ActionRowBuilder();
        }
      }
      if (row.components.length > 0) rows.push(row);
      await interaction.reply({
        content: `Pilih produk pada kategori **${kategori}**:`,
        components: rows,
        ephemeral: true,
      });
    } else if (parts[0] === "topup" && parts[1] === "produk") {
      const kategori = parts[2];
      const id = parseInt(parts[3]);
      const produk = categories[kategori]?.find((p) => p.id === id);
      if (!produk)
        return await interaction.reply({
          content: "Produk tidak ditemukan.",
          ephemeral: true,
        });
      const detail = [
        `**UCP :** [ISI YAH SAYANG]`,
        `**Nama Discord :** ${interaction.user.username}`,
        `**Nama Ic :** [ISI YAH SAYANG]`,
        `**Nama Produk :** ${produk.name}`,
        `**Harga :** Rp${formatRupiah(produk.price)}`,
      ].join("\n");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`topup_payment_${kategori}_${produk.id}`)
          .setLabel("Payment")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`topup_desc_${kategori}_${produk.id}`)
          .setLabel("Deskripsi")
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        content: detail,
        components: [row],
        ephemeral: false,
      });
    } else if (parts[0] === "topup" && parts[1] === "payment") {
      const kategori = parts[2];
      const id = parseInt(parts[3]);
      const produk = categories[kategori]?.find((p) => p.id === id);
      if (!produk)
        return await interaction.reply({
          content: "Produk tidak ditemukan.",
          ephemeral: true,
        });
      await interaction.reply({
        content: `**[PEMBAYARAN]**\nSilakan transfer ke: \nDANA: 083141548300\n\nSetelah transfer, kirim bukti pembayaran ke admin dengan format:\n\nNama Produk: ${produk.name}\nNominal: Rp${formatRupiah(produk.price)}\n\nNama Pengirim: isi sendiri\nNama Pengirim: Sertakan Bukti Screenshot\n\nTerima kasih!`,
        ephemeral: true,
      });
    } else if (parts[0] === "topup" && parts[1] === "desc") {
      const kategori = parts[2];
      const id = parseInt(parts[3]);
      const produk = categories[kategori]?.find((p) => p.id === id);
      if (!produk)
        return await interaction.reply({
          content: "Produk tidak ditemukan.",
          ephemeral: true,
        });
      await interaction.reply({
        content: `**Deskripsi Produk:**\n${produk.desc}`,
        ephemeral: true,
      });
    }
  }
});

// Express (Railway keepalive)
const server = express();
server.get("/", (req, res) => res.send("Bot Store Online!"));
server.listen(process.env.PORT || 3000, () => console.log("Web server aktif"));

// Start client
client.login(TOKEN);
