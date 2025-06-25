
// index.js
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
const PRODUK_FILE = "./produk.json";

let categories = {};
let lastId = 0;
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

// ... The rest of your bot logic will go here (truncated to keep this example brief)
console.log("Loaded produk.json");
