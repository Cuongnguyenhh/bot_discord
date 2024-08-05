const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const messageCounts = {};
const voiceQueue = [];
let currentConnection = null;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

async function checkAndDisconnectUser(userId) {
    const guild = client.guilds.cache.get('872130384542974002'); // Replace with your guild ID
    const memberToDisconnect = guild.members.cache.get(userId);

    if (memberToDisconnect && memberToDisconnect.voice.channel) {
        try {
            await memberToDisconnect.voice.setChannel(null);
            console.log(`Disconnected user with ID ${userId} successfully.`);
        } catch (error) {
            console.error(`Failed to disconnect user with ID ${userId}:`, error);
        }
    } else {
        console.log(`User with ID ${userId} not found in server or not in voice channel.`);
    }
}

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const userId = message.author.id;
    const currentMonth = new Date().getMonth();

    if (!messageCounts[userId]) {
        messageCounts[userId] = { month: currentMonth, count: 0 };
    }

    if (messageCounts[userId].month !== currentMonth) {
        messageCounts[userId].month = currentMonth;
        messageCounts[userId].count = 0;
    }

    messageCounts[userId].count += 1;

    const args = message.content.slice(1).trim();

    const commands = [
        'piu-voice [nội dung] - Đọc nội dung.',
        'piu-kick @người_dùng [lý do] - Kick người dùng.',
        'piu-invite @người_dùng - Mời người dùng.',
        'piu-count - Xem số tin nhắn trong tháng.',
        'piu-mute @người_dùng - Tắt tiếng người dùng.',
        'piu-unmute @người_dùng - Bỏ tắt tiếng người dùng.',
        'piu-move @người_dùng - Chuyển Người dùng từ phòng khác sang phòng của bạn.',
        'piu-play [YouTube URL] - Phát nhạc từ YouTube.'
    ];

    if (args.length === 0) {
        return message.channel.send(`Các lệnh có sẵn: \n${commands.join('\n')}`);
    }

    const suggestions = commands.filter(cmd => cmd.startsWith(args));

    if (suggestions.length > 0) {
        message.channel.send(`Gợi ý lệnh: \n${suggestions.join('\n')}`);
    }

    if (args.startsWith('piu-play')) {
        const url = args.split(' ')[1];

        if (!ytdl.validateURL(url)) {
            return message.channel.send('Vui lòng cung cấp một URL YouTube hợp lệ!');
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.channel.send('Bạn không tham gia bất kỳ phòng thoại nào!');
        }

        try {
            if (!currentConnection) {
                currentConnection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });
            }

            const stream = ytdl(url, {
                filter: 'audioonly',
                highWaterMark: 1 << 25,
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                }
            });

            const audioResource = createAudioResource(stream);
            const audioPlayer = createAudioPlayer();

            audioPlayer.play(audioResource);
            currentConnection.subscribe(audioPlayer);

            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                currentConnection.destroy();
                currentConnection = null;
            });

            message.channel.send(`Đang phát nhạc: ${url}`);
        } catch (error) {
            console.error('Error playing audio:', error);
            message.channel.send('Có lỗi xảy ra khi phát nhạc từ YouTube!');
        }
    }

    if (args.startsWith('piu-voice')) {
        const contentToSpeak = message.content.slice(10).trim();
        if (contentToSpeak.length < 10000) {
            if (!contentToSpeak) {
                return message.channel.send('Vui lòng cung cấp nội dung bạn muốn bot đọc!');
            }

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                return message.channel.send('Bạn không tham gia bất kỳ phòng thoại nào!');
            }

            const modifiedContent = (userId === '869924464735961148')
                ? "" + contentToSpeak
                : contentToSpeak;

            const chunks = splitTextIntoChunks(modifiedContent, 200);
            chunks.forEach(chunk => voiceQueue.push({ content: chunk, message }));

            if (!currentConnection) {
                currentConnection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });

                processQueue();
            }

            console.log(contentToSpeak);
            console.log(message.author);
        } else {
            message.channel.send('Nội dung quá dài. Vui lòng rút ngắn văn bản!');
        }
    }

    if (args.startsWith('piu-sing')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.channel.send('Bạn không tham gia bất kỳ phòng thoại nào!');
        }

        const audioDir = path.join(__dirname, 'audio');
        fs.readdir(audioDir, (err, files) => {
            if (err) {
                console.error('Error reading directory:', err);
                return message.channel.send('Có lỗi xảy ra khi quét các file âm thanh!');
            }

            const mp3Files = files.filter(file => file.endsWith('.mp3'));

            if (mp3Files.length === 0) {
                return message.channel.send('Không tìm thấy file MP3 nào trong thư mục!');
            }

            // Create action rows for buttons
            const rows = [];
            while (mp3Files.length > 0) {
                const buttons = mp3Files.splice(0, 5).map(file => new ButtonBuilder()
                    .setCustomId(file)
                    .setLabel(file.replace('.mp3', ''))
                    .setStyle(ButtonStyle.Primary));

                rows.push(new ActionRowBuilder().addComponents(buttons));
            }

            message.channel.send({ content: 'Chọn file âm thanh để phát:', components: rows });
        });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const fileName = interaction.customId;
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply('Bạn không tham gia bất kỳ phòng thoại nào!');
    }

    const filePath = path.join(__dirname, 'audio', fileName);

    if (!fs.existsSync(filePath)) {
        return interaction.reply('File không tồn tại trong dự án!');
    }

    try {
        if (!currentConnection) {
            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
        }

        const audioResource = createAudioResource(fs.createReadStream(filePath));
        const audioPlayer = createAudioPlayer();

        audioPlayer.play(audioResource);
        currentConnection.subscribe(audioPlayer);

        audioPlayer.on(AudioPlayerStatus.Idle, () => {
            currentConnection.destroy();
            currentConnection = null;
        });

        interaction.reply(`Đang phát file: ${fileName}`);
    } catch (error) {
        console.error('Error playing audio file:', error);
        interaction.reply('Có lỗi xảy ra khi phát file âm thanh!');
    }
});

function splitTextIntoChunks(text, chunkSize) {
    const chunks = [];
    let startIndex = 0;
    while (startIndex < text.length) {
        let endIndex = startIndex + chunkSize;
        if (endIndex > text.length) endIndex = text.length;
        chunks.push(text.slice(startIndex, endIndex));
        startIndex = endIndex;
    }
    return chunks;
}

async function processQueue() {
    if (voiceQueue.length === 0) {
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
        }
        return;
    }

    const { content: contentToSpeak, message } = voiceQueue.shift();

    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=${encodeURIComponent(contentToSpeak)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error('Error fetching audio:', response.statusText);
            message.channel.send('Có lỗi xảy ra khi đọc văn bản. Vui lòng thử lại!');
            processQueue();
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Create a Readable Stream from the buffer
        const readableStream = require('stream').Readable.from(buffer);

        const audioResource = createAudioResource(readableStream);
        const audioPlayer = createAudioPlayer();

        audioPlayer.play(audioResource);
        currentConnection.subscribe(audioPlayer);

        audioPlayer.on(AudioPlayerStatus.Idle, () => {
            processQueue();
        });
    } catch (error) {
        console.error('Error reading text:', error);
        message.channel.send('Có lỗi xảy ra khi đọc văn bản. Vui lòng thử lại!');
        processQueue();
    }
}


client.login('');  // Replace with your actual bot token
