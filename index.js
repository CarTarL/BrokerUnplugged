
// -------------------------------------------------------
// Game: Broker Unplugged
// V 1.0	3/30/2022
// Discord Bot
// Developer: CarTarL
// Actions: CarTarL, digidot
// -------------------------------------------------------

// standard libraries
const fs = require('fs');
// include Discord API
const { Client, Intents, Collection, MessageEmbed } = require('discord.js');
// include REST and Discord API types
 const { REST } = require('@discordjs/rest');
 const { Routes } = require('discord-api-types/v9');
// use axios for http
const axios = require('axios');

// include our own configuration settings
const config = require("./config.json");

// get nft data
// static now that we know details of all 10,001
const cbNFTFName = './nfts.json';
const cbNFTs = require(cbNFTFName);
// get nft owners data
const cbPlayerFName = './players.json';
const cbPlayers = require(cbPlayerFName);
// get action templates
const cbActionsFName = './actions.json';
const cbActions = require(cbActionsFName);


// -------------------------------------------------------
// VARIABLES
// -------------------------------------------------------

// global game variables

// main game object for all instances
// indexed by channelId
var games = {};
// blank game object
gameObj = {
  ownerId: "",
  players: [],
  playersRemaining: [],
  roundNum: 0,
  guildId: "",
  channelId: "",
  startMsgId: "",
  timeouts: config.timeouts,		// first one is game start
  timeoutIdx: 0,
  demo: false,
};
// blank player object
playerObj = {
  did: "",
  address: "",
  brokers: [],
  primary: -1,
};

var gameSaveDirty = false;

// otherko is added in based talent of person being elimintated
var gameActionOptions = [ 
  "wastetime", "koself", "koother", "nothing",
];
// filled with Emojis indexed by lower(talent)
var ogTalents = [];
var talentEmojis = {};
var extraEmojis = ['wastetime','eliminated','revived'];

const slashCommands = [
  {
    name: "bustart",
    description: "start Broker Unplugged game"
  },
  {
    name: "bustop",
    description: "stop in process Broker Unplugged game"
  },
  {
    name: "budemo",
    description: "run a game demonstration wihtout interaction"
  },
  {
    name: "buemojis",
    description: "show the emojis used in the game"
  },
  {
    name: "usebroker",
    description: "select Broker to use Broker Unplugged game",
    options: [
    {
      name: "tokenid",
      description: "The token id of the Broker you would like to use",
      required: true,
      type: 4
    }
    ]
  }
];


// -------------------------------------------------------
// MESSAGE TEMPLATES
// -------------------------------------------------------

// js pad integer into string
const zeroPad = (num, places) => String(num).padStart(places, '0');

// random array suffle
function arrayShuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

// js sprintf
if (!String.format) {
  String.format = function(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}


// template: join game
const embedStarting = {
  color: 0x0099ff,
  title: 'Broker Unplugged (Hosted by VARUSERNAME)',
  description: config.gameDesc,
  thumbnail: {
    url: config.gameLogo
  },
  fields: [
    {
      name: 'Created By:',
      inline: true,
      value: config.gameCredits
    },
    {
      name: 'Starting:',
      inline: true,
      value: 'in VARSECONDS seconds!'
    }
  ],
  footer: {
    text: 'The game is just for fun - it does NOT change/modify your NFT...',
  },
};

// template: join reminder
const embedStartingReminder = {
  color: 0x0099ff,
  title: 'Broker Unplugged (Hosted by VARUSERNAME)',
  description: 'Starting in **VARSECONDS seconds**\n\nReact on [this post](VARURL) to join',
  thumbnail: {
    url: config.gameLogo
  },
};

// template: not enough players
const embedMinPlayers = {
  color: 0x0099ff,
  title: 'Broker Unplugged (Hosted by VARUSERNAME)',
  description: 'Unfortunately there were not enough player to start the game.\nGather more players and restart.',
  thumbnail: {
    url: config.gameLogo
  },
};

// template: start game
const embedStart = {
  color: 0x0099ff,
  title: 'Broker Unplugged (Hosted by VARUSERNAME)',
  description: '__**Players**__:\n\nVARPLAYERS\n\nNumber of players: VARNUMPLAYERS',
  thumbnail: {
    url: config.gameLogo
  },
};

// template: end game
const embedEnd = {
  color: 0x0099ff,
  title: 'Broker Unplugged (Hosted by VARUSERNAME)',
  description: 'Game was ended by host',
  thumbnail: {
    url: config.gameLogo
  },
};

// template: game round
const embedRound = {
  color: 0x0099ff,
  title: '__Round VARROUNDNUM__',
  description: '\nVARACTIONS\n\nPlayers Left: VARNUMPLAYERS'
};

// template: end winner
const embedWinner = {
  color: 0x0099ff,
  title: 'Winner: VARWINNER',
  url: config.cbURL,
  description: 'This Broker overcame all odds and made history as the first Broker to become unplugged and returned to their earthly body!',
  thumbnail: {
    url: config.gameLogo
  },
  image: {
    url: 'VARPICURL',
  },
  footer: {
    text: '',
  }
};

// template: emojis display
const embedEmojis = {
  color: 0x0099ff,
  title: 'Game Emojis',
  description: '\nVAREMOJIS'
};

// ----------------------------------------------------------
// FUNCTIONS 
// ----------------------------------------------------------

// format action template using player 1, player 2 data
function actionCreate(template,p1,p2=null) {

  text = template.action;
  etalent1 = p1.cb.talent.toLowerCase();
  etalent1 = etalent1.replace(/\s/,'');
  if (p2 != null) {
    etalent2 = p2.cb.talent.toLowerCase();
    etalent2 = etalent2.replace(/\s/,'');
  }

  p1n = String.format("**{0}**", p1.cb.name);
  p1t = String.format("*{0}*", p1.cb.talent);
  if (p2 != null) {
    p2n = String.format("**{0}**", p2.cb.name);
    p2t = String.format("*{0}*", p2.cb.talent);
  }

  // player|talent
  text = text.replace('{1E}',talentEmojis[etalent1]);
  text = text.replace('{1T}',p1t);
  text = text.replace('{1}',p1n);
  if (p2 != null) {
    text = text.replace('{2E}',talentEmojis[etalent2]);
    text = text.replace('{2T}',p2t);
    text = text.replace('{2}',p2n);
  }

  return text;
}

// message: initial join
async function msgStarting(chid) {

  // game was stopped
  if (games[chid] === 'undefined') { return; }
  g = games[chid];

  // get required discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);
  owner = guild.members.cache.get(g.ownerId);

  // modify message
  embed = JSON.parse(JSON.stringify(embedStarting));	// deep copy
  embed.title = embed.title.replace('VARUSERNAME',owner.user.username);
  embed.fields[1].value = embed.fields[1].value.replace('VARSECONDS',
    	g.timeouts[0]);
  if (g.demo && embed.footer.text.search("DEMO MODE") < 0) {
    embed.footer.text += '\nDEMO MODE';
  }

  // send message
  start = await channel.send({ embeds: [embed] });
//  start = await interaction.reply({ embeds: [embed] });
  // add reaction
  remoji = client.emojis.cache.find(e => e.name === config.startingEmoji);
  start.react(remoji.id);

  // save start message
  g.startMsgId = start.id;
}

// message: join reminder
function msgStartingReminder(chid,seconds) {

  // game was stopped
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  // get required discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);
  start = channel.messages.cache.get(g.startMsgId);
  owner = guild.members.cache.get(g.ownerId);

  // modify message
  embed = JSON.parse(JSON.stringify(embedStartingReminder));	// deep copy
  embed.title = embed.title.replace('VARUSERNAME',owner.user.username);
  embed.description = embed.description.replace('VARSECONDS',seconds);
  embed.description = embed.description.replace('VARURL',start.url);
  if (g.demo) {
    embed.footer = {};
    embed.footer.text = 'DEMO MODE';
  }

  // send message
  channel.send({ embeds: [embed] });
}

// message: game already started
function msgAlreadyStarted(interaction) {

  // get required discord objects
  channel = client.channels.cache.get(interaction.channelId);

  channel.send("game already in progress in this channel...");
}

// game: round message
// this function is the bulk of the game
function gameRoundNext(chid) {

  // game was stopped
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  // get necessary discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);

  // incrememnt round number
  g.roundNum +=1;

  // get copy of player to work with
//  rplayers = Array.from(g.playersRemaining);
  rplayers = JSON.parse(JSON.stringify(arrayShuffle(g.playersRemaining)));

  // loop through players
  actions = [];
  waiting = [];
  ractions = 0;
  for (var did of g.playersRemaining) {
    ractions++;

    // get player index id
    plid = 'did_' + did;

    // if we are down to 1 player, don't kill anyone else !
    if (rplayers.length == 1) { continue; }

    // if player is already dead
    if (rplayers.indexOf(did) < 0) { continue; }

    // Don't go past max # of actions/round
    if (ractions > config.maxActionsPerRound) { continue; }

    // Don't go past max % out per round
    top = g.playersRemaining.length + waiting.length- rplayers.length + 1;
    if (((top / g.playersRemaining.length)*100) > config.maxOutPerRoundPercent) {
      continue;
    }

    // get player
    p1 = g.players[plid];

    // roll odds for this player for action type
    atype = gameActionOptions[Math.floor(
      Math.random() * gameActionOptions.length)];
    if (rplayers.length == 1 && atype == "koother") {
      atype = "koself";
    }

    // process action type selected
    action = "";
    aicon = "";
    found = false;
    switch (atype) {
      case 'nothing':
	break;
      case 'wastetime':
	found = true;
	aicon = "wastetime";
	// player 1
	options = cbActions[p1.cb.talent][atype];
        options = options.concat(cbActions["Generic"][atype]);
	index = Math.floor(Math.random() * options.length);
	template = options[index]
	// action
	action = actionCreate(template,p1);
	// waitlist player1
	waiting.push(did);
	rplayers.splice(rplayers.indexOf(did),1);
	break;
      case 'koself':
	found = true;
	aicon = "eliminated";
	// player 1
	options = cbActions[p1.cb.talent][atype];
        options = options.concat(cbActions["Generic"][atype]);
	index = Math.floor(Math.random() * options.length);
	template = options[index];
	// action
	action = actionCreate(template,p1);
	// delete player 1
	rplayers.splice(rplayers.indexOf(did),1);
	break;
      case 'koother':
	found = true;
	aicon = "eliminated";
	// randomly select 2nd player being affected
//        players2 = Array.from(rplayers);
        players2 = JSON.parse(JSON.stringify(rplayers));
	players2.splice(players2.indexOf(did),1);
	index = Math.floor(Math.random() * players2.length);
	p2 = g.players['did_' + players2[index]];
	// get options based on player 1
	options = cbActions[p1.cb.talent][atype];
        options = options.concat(cbActions['Generic'][atype]);
	// add in otherko options based on player 2 talent
        options = options.concat(cbActions[p2.cb.talent]['otherko']);
	// select one from random
	index = Math.floor(Math.random() * options.length);
	template = options[index];
	// delete player 2
	rplayers.splice(rplayers.indexOf(p2.did),1);
	// action
	action = actionCreate(template,p1,p2);
	break;
    }

    // if there was an action for this player, add it to list to display
    if (found) {
      actions.push(talentEmojis[aicon] + " | " + action);
    }
  }

  // add waiting back in
  rplayers = rplayers.concat(waiting);

  // revive
  found = false;
  for (var did of g.playersRemaining) {
    // get player index id
    plid = 'did_' + did;

    // we already revived one, 0 chance to revive another
    if (found) { continue; }
    // ignore players still in game
    if (rplayers.indexOf(did) >= 0) { continue; } 
    // do random roll for revive
    if ((Math.random() * 100) <= config.revivePercent) {
      // mark as found, so we don't revive another
      found = true;
      aicon = 'revived';
      // get player revived
      p1 = g.players[plid];
      // get a revive action
      options = cbActions[p1.cb.talent]['revive'];
      options = options.concat(cbActions['Generic']['revive']);
      index = Math.floor(Math.random() * options.length);
      template = options[index];
      action = actionCreate(template,p1);
      actions.push(talentEmojis[aicon] + " | " + action);
      // add them back into in-game players
      rplayers.push(did);
    }
  }

  // nothing happened
  if (actions.length == 0) {
    actions.push(talentEmojis['wastetime'] + 
      " Nothing happened... how boring...");
  }

  // create message for this round
  embed = JSON.parse(JSON.stringify(embedRound));	// deep copy
  embed.title = embed.title.replace('VARROUNDNUM',g.roundNum);
  embed.description = embed.description.replace(
    	'VARACTIONS',actions.join("\n"));
  embed.description = embed.description.replace(
    'VARNUMPLAYERS',rplayers.length);
  if (g.demo) {
    embed.footer = {};
    embed.footer.text = 'DEMO MODE';
  }

  // save remaining players
  // shuffle array so we don't get same action order next time
  g.playersRemaining = JSON.parse(JSON.stringify(arrayShuffle(rplayers)));

  // send mesasge for round
  channel.send({ embeds: [embed] });

  // Someone won
  if (rplayers.length == 1) {
    gameWon(chid);


  // set time for next round
  } else {
    setTimeout(
      gameRoundNext,
      1000*config.roundInterval,
      chid
    );
  }
}

// game: end/won
function gameWon(chid) {

  // game was stopped
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  // get necessary discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);
  owner = guild.members.cache.get(g.ownerId);

  // get player
  plid = 'did_' + g.playersRemaining.pop();
  p = g.players[plid];

  // convert to emoji talent
  etalent = p.cb.talent.toLowerCase();
  etalent = etalent.replace(/\s/,'');

  // format strings for use
  pref = String.format('<@{0}>',p.did);
  ptalent = String.format('{0} {1}', talentEmojis[etalent], p.cb.talent);
  oref = String.format('<@{0}>',owner.id);

  // get small version of broker image
  var nfturl = 'https://cartarl.com/jcb/nfts/png-small/cyberbroker-' +
    p.cb.tid + '-small.png';

  stats = "";
  stats = stats + "`Mind:` " + p.cb.mind + "\n";
  stats = stats + "`Body:` " + p.cb.body + "\n";
  stats = stats + "`Soul:` " + p.cb.soul;
  cbid = '`CB' + zeroPad(p.cb.tid,4) + '`';

  // create embedded message
  embed = JSON.parse(JSON.stringify(embedWinner));	// deep copy
  embed.title = embed.title.replace('VARWINNER',p.cb.name);
  embed.image.url = embed.image.url.replace('VARPICURL',nfturl);
  embed.fields = [];
  embed.fields.push({ name: "Talent", value: ptalent, inline: true});
  embed.fields.push({ name: "Class", value: p.cb.class, inline: true});
  embed.fields.push({ name: "Species", value: p.cb.species, inline: true});
  embed.fields.push({ name: "NFT ID", value: cbid, inline: true});
  embed.fields.push({ name: "Traits", value: p.cb.ntraits, inline: true});
  embed.fields.push({ name: "Stats", value: stats, inline: true});
  embed.fields.push({ name: "Player", value: pref, inline: true});
  embed.footer.text = '\nBroker Unplugged - Hosted by ' + owner.user.username;

  // send to channel
  channel.send({ embeds: [embed] });

  // delete game
  if (! games.hasOwnProperty(chid)) { return; }
  delete games[chid];
}

// game: react to start command
// first function called
function gameStart(chid) {

  // game was stopped
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  // get necessary discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);
  owner = guild.members.cache.get(g.ownerId);

  // make sure we have enough players
  if (g.playersRemaining.length < config.minPlayers) {
    // send message
    embed = JSON.parse(JSON.stringify(embedMinPlayers));	// deep copy
    channel.send({ embeds: [embed] });
    // delete game
    if (! games.hasOwnProperty(chid)) { return; }
    delete games[chid];
    return;
  }

  // get all NFT IDs to pick from randomly, if needed
  randnftids = Object.keys(cbNFTs);

  // const cbNFTs = require("./nfts.json");
  // const cbNFTowners = require("./nftowners.json");
  // get player details
  count = 1;
  players_refs = [];
//  for (var did in g.players) {
  for (var did of g.playersRemaining) {

    // create player index id
    plid = 'did_' + did;

    p = JSON.parse(JSON.stringify(playerObj));		// deep copy
    // use last saved broker
    if (cbPlayers.hasOwnProperty(plid)) {
      p = JSON.parse(JSON.stringify(cbPlayers[plid]));
      p.cb = cbNFTs[p.primary];

    // otherwise pick random broker
    } else {
      p.did = did;
      p.primary = randnftids[Math.floor(Math.random() * randnftids.length)];
      p.cb = cbNFTs[p.primary];
    }

    // add to players
    g.players[plid] = p;
    p = g.players[plid];

    // get talent and massage
    etalent = p.cb.talent.toLowerCase();
    etalent = etalent.replace(/\s/,'');

    // create player list entry
    uname = '';
    if (g.demo) {
      uname = '@Test' + count;
    } else {
      uname = String.format('<@{0}>',did);
    }
    pname = "";
    pname = String.format('{0} `CB{1}` **{2}** {3}  {4}', 
	        talentEmojis[etalent], zeroPad(p.cb.tid,4),
		p.cb.name, p.cb.talent, uname);
    players_refs.push(pname);

    count++;
  }

  // modify message
  embed = JSON.parse(JSON.stringify(embedStart));	// deep copy
  embed.title = embed.title.replace('VARUSERNAME',owner.user.username);
  embed.description = embed.description.replace(
    	'VARPLAYERS',players_refs.join("\n"));
  embed.description = embed.description.replace(
    'VARNUMPLAYERS',g.playersRemaining.length);
  if (g.demo) {
    embed.footer = {};
    embed.footer.text = 'DEMO MODE';
  }

  // send message
  channel.send({ embeds: [embed] });

  // start first round
  setTimeout(
    gameRoundNext,
    1000*config.roundInterval,
    chid
  );

}

// game: join reminders
function gameStartingReminder(chid) {

  // game was stopped
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  // get necessary discord objects
  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);

  // Send another starting reminder
  if (g.gameTimeoutIndex < g.timeouts.length) {
    if (g.gameTimeoutIndex > 0) {
      msgStartingReminder(g.timeouts[g.gameTimeoutIndex-1]);
    }
    setTimeout(
      gameStartingReminder,
      1000*g.timeouts[g.gameTimeoutIndex],
      chid
    );

  // Start the game
  } else {
    setTimeout(
      gameStart,
      1000*g.timeouts[g.gameTimeoutIndex],
      chid
    );
  }

  g.gameTimeoutIndex += 1;
}

// game: initial join
function gameStarting(chid,interaction,demo) {

  // create new instance
  games[chid] = JSON.parse(JSON.stringify(gameObj));	// deep copy
  games[chid].ownerId = interaction.user.id;
  games[chid].guildId = interaction.guildId;
  games[chid].channelId = interaction.channelId;
  if (demo) {
    games[chid].timeouts = config.demoTimeouts;
    games[chid].demo = true;
  }

  // game reference
  g = games[chid];


  // create example players for demo mode
  if (g.demo) {
    g.playersRemaining.push(g.ownerId);
    did = "012345678901234568";
    g.playersRemaining.push(did);
    did = "012345678901234567";
    g.playersRemaining.push(did);
    did = "112345678901234567";
    g.playersRemaining.push(did);
    did = "212345678901234567";
    g.playersRemaining.push(did);
    did = "312345678901234567";
    g.playersRemaining.push(did);
    did = "412345678901234567";
    g.playersRemaining.push(did);
    did = "512345678901234567";
    g.playersRemaining.push(did);
    did = "612345678901234567";
    g.playersRemaining.push(did);
  }

  // send initial signup message
  msgStarting(chid);

  // set timer for game start
  startTime = g.timeouts[0];
  setTimeout(
    gameStart,
    1000*startTime,
    chid
   );

  // set timers for game starting reminders
  for (i=1; i<g.timeouts.length; i++) {
    seconds = g.timeouts[i];
    setTimeout(
      msgStartingReminder,
      1000*(startTime-seconds),
      chid,
      seconds
    );
  }

}

// game: manaul stop command
function gameStop(chid) {

  // get variables
  if (! games.hasOwnProperty(chid)) { return; }
  g = games[chid];

  guild = client.guilds.cache.get(g.guildId);
  channel = guild.channels.cache.get(g.channelId);

  // create embed message
  embed = JSON.parse(JSON.stringify(embedEnd));		// deep copy
  embed.title = embed.title.replace('VARUSERNAME',owner.user.username);

  // send message
  channel.send({ embeds: [embed] });

  // delete game
  delete games[chid];
}

// get necessary Emojis for game and index them
// Emojis are loaded into my Discord ahead of time
// Bot can access Emojis from any server its in
function gameEmojisGet() {

  // we have emoji for each Talent
  enames = [];
  for (var talent in cbActions) {
    if (talent == "Generic") { continue; }
    enames.push(talent);
  }
  // add in other game emojis
  for (var ename of extraEmojis) {
    enames.push(ename);
  }
  
  // loop through required emoji names
  for (var ename of enames) {
    // lowercase and get rid of spaces
    ename = ename.toLowerCase();
    ename = ename.replace(/\s/g,'');
    gamename = "cbbu_" + ename;

    // look for existing emoji across servers using client
    // store globally for use by all
    e = client.emojis.cache.find(e => e.name === gamename);
    if (! e) {
      talentEmojis[ename] = "";
      console.log("Can't find Emoji for: ",gamename);
    } else {
      talentEmojis[ename] = String.format('<:{0}:{1}>',e.name,e.id); 
    }
  }

}

/* discord doesn't seem to like quick add/delete of emojis
   so loading them manually into single server for use by bot
async function gameEmojisCreate(guild) {

  // loop through Talents
  for (var talent in cbActions) {
    // lowercase and get rid fo spaces
    talent = talent.toLowerCase();
    talent = talent.replace(/\s/g,'');
    etalent = "cb" + talent;

    e = guild.emojis.cache.find(e => e.name === etalent);
    if (e) { continue; }

    // create emoji filename
    console.log("creating emoji: ",etalent);
    eurl = String.format("https://www.cartarl.com/jcb/icons/emoji-{0}.png", talent);
    await guild.emojis.create(eurl,etalent)
    .catch(error => {
      console.log(error.requestData.json.name);
    });
  }
}
*/

// create message with all emojis used in game 
function gameDisplayEmojis(interaction) {

  // get list of emoji names to Talent
  n2t = [];
  for (var talent in cbActions) {
    ename = talent.toLowerCase();
    ename = ename.replace(/\s/g,'');
    n2t[ename] = talent;
  }

  // create list of Emojis, 3 per line
  count = 0;
  text = "";
  for (var ename in talentEmojis) {
    count++;
    label = ename;
    if (n2t[ename]) { label = n2t[ename]; }
    text = text + talentEmojis[ename] + " " + label + "  ";
    if (count >=3) {
      count = 0;
      text = text + "\n";
    }
  }

  // put into embed message
  embed = JSON.parse(JSON.stringify(embedEmojis));	// deep copy
  embed.description = embed.description.replace(
    	'VAREMOJIS',text);
  embed.footer = {};
  embed.footer.text = 'DEMO MODE';

  // send message back to channel
  interaction.channel.send({ embeds: [embed] });
}

function gameUseBroker(interaction) {

  // start reply
  text = "";
  text = text + "You have selected the following Broker:\n\n";

  // get nftid from slash command
  nftid = interaction.options.getInteger("tokenid");

  // validate selection
  if (nftid == 0 && interaction.user.name != "josie" && 
	interaction.user.discriminator != "9623") {
    text = "Only one person can be Asherah...\nplease pick another Broker";
    interaction.reply({ content: text, ephemeral: true });
    return;
  }
  if (nftid < 0 || nftid > 10000) {
    text = "Please pick a tokenid in the range from 0-10000";
    interaction.reply({ content: text, ephemeral: true });
    return;
  }

  // save selection
  plid = "did_" + interaction.user.id
  if (cbPlayers.hasOwnProperty(plid)) {
    cbPlayers[plid].primary = nftid;
  } else {
    cbPlayers[plid] = JSON.parse(JSON.stringify(playerObj));
    cbPlayers[plid].did = interaction.user.id 
    cbPlayers[plid].primary = nftid;
  }

  // get corresponding nft
  nft = cbNFTs[nftid];

  // create personalized response
  pname = "";
  etalent = nft.talent.toLowerCase();
  etalent = etalent.replace(/\s/,'');
  pname = String.format('{0} `CB{1}` **{2}** {3} | {4} | {5}', 
        talentEmojis[etalent], zeroPad(nft.tid,4),
	nft.name, nft.talent, nft.class, nft.species);
  text = text + pname + "\n\n";
  text = text + "This selection will be saved for future games.";

  // send back private message confirmation
  interaction.reply({
    content: text,
    ephemeral: true
  });
}

function gameSave() {

  // if there has been an update
  if (gameSaveDirty) {
    // reset dirty flag
    gameSaveDirty = false;

    // save file
    fs.writeFileSync(cbPlayerFName,JSON.stringify(cbPlayers));
  }

  // set next save
  setTimeout(
    gameSave,
    1000*config.saveInterval
  );
}

function gameCheckPermission(member) {

  result = true;

  if (config.hasOwnProperty('roleRequire') &&
		config.roleRequire == true) {

    result = false;

    // check for rolename exists
    if (config.hasOwnProperty('roleName') && config.roleName != '') {
      // check user has role

      hasRole = member.roles.cache.some(role => 
	    	role.name === config.roleName);
      if (hasRole) {
	result = true;
      }
    }
  }

  return result;
}



// ----------------------------------------------------------
// MAIN 
// ----------------------------------------------------------

  // create Discord client
  const client = new Client({
  	intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS"],
  	partials: ["CHANNEL"]
  });


  // CALLBACK: CLIENT READY
  client.on('ready', () => {
    // show who we are
    console.log(`Bot logged in as ${client.user.tag}!`);

    // setup REST channel for communication
    const dREST = new REST({ version: '9' }).setToken(config.dauth_token);

    // register slash commands
    try {
      (async () => {
        await dREST.put(
          Routes.applicationCommands(client.user.id), { body: slashCommands })
           .catch(console.error);
      })();
      console.log('Successfully registered application commands globally');
    } catch (error) {
      console.log(error);
    }

    // load Emojis from Client, which has access to multiple servers
    // to pull Emojis from
    gameEmojisGet();

    // setup game save
    setTimeout(
      gameSave,
      1000*config.saveInterval
    );
  });


  // CALLBACK: REACTION
  client.on('messageReactionAdd', (reaction, user) => {
    // get game
    chid = 'ch_' + reaction.message.channelId
    if (! games.hasOwnProperty(chid)) { return; }
    g = games[chid];

    // add player, if not already added
    if(reaction.emoji.name === config.startingEmoji && ! user.bot) {
      if (g.playersRemaining.indexOf(user.id) < 0) {
        g.playersRemaining.push(user.id);
      }
    }
  });
  client.on('messageReactionRemove', (reaction, user) => {
    // get game
    chid = "ch_" + reaction.message.channelId
    if (! games.hasOwnProperty(chid)) { return; }
    g = games[chid];

    // remove player, if currenlty added
    if(reaction.emoji.name === config.startingEmoji && ! user.bot) {
      g.playersRemaining.split(g.playersRemaining.indexOf(user.id),1);
    }
  });

  // CALLBACK: INTERACTIONS
  client.on('interactionCreate', async (interaction) => {
    // if this isn't a command, ignore
    if (!interaction.isCommand()) return;

    // get discord objects
    chid = "ch_" + interaction.channelId;

    // command: game start
    if (interaction.commandName === 'bustart') {
      // check for role requirement to start
      hasRole = gameCheckPermission(interaction.member);
      if (! hasRole) {
        interaction.reply({ 
          content: "You do not have proper permissions to use this command",
          ephemeral: true });
        return;
      }
      // already started, don't start again
      if (games.hasOwnProperty(chid)) {
        msgAlreadyStarted();
      // start new game
      } else {
	interaction.reply({ content: "Starting Broker Unplugged", 
	  	ephemeral: true });
        gameStarting(chid,interaction,false);
      }
    }

    // command: game end
    if (interaction.commandName === 'bustop') {
      hasRole = gameCheckPermission(interaction.member);
      if (! hasRole) {
        interaction.reply({ 
          content: "You do not have proper permissions to use this command",
          ephemeral: true });
        return;
      }
      if (games.hasOwnProperty(chid)) {
        if (games[chid].ownerId == interaction.user.id) {
	  interaction.reply({ content: "Broker Unplugged Stopped", 
	  	ephemeral: true });
          gameStop(chid);
        }
      }
    }

    // command: select broker 
    if (interaction.commandName === 'usebroker') {
      gameSaveDirty = true;
      gameUseBroker(interaction);
    }

    // command: run demo
    if (interaction.commandName === 'budemo') {
      hasRole = gameCheckPermission(interaction.member);
      if (! hasRole) {
        interaction.reply({ 
          content: "You do not have proper permissions to use this command",
          ephemeral: true });
        return;
      }
      interaction.reply({ content: "Starting demo game", ephemeral: true });
      if (games.hasOwnProperty(chid)) {
        msgAlreadyStarted();
      } else {
        gameStarting(chid,interaction,true);
      }
    }

    // command: display game emojis
    if (interaction.commandName === 'buemojis') {
      hasRole = gameCheckPermission(interaction.member);
      if (! hasRole) {
        interaction.reply({ 
          content: "You do not have proper permissions to use this command",
          ephemeral: true });
        return;
      }
      interaction.reply({ content: "Emojis used in game", ephemeral: true });
      gameDisplayEmojis(interaction);
    }

  });


// login and listen
client.login(config.dauth_token);

