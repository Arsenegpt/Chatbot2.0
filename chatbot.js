const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const axios = require('axios');

require('dotenv').config();
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

const asaasHeaders = {
  'Content-Type': 'application/json',
  'access_token': ASAAS_API_KEY
};

// ✅ Atendentes
const atendenteTecnico = '556596193619@c.us';
const atendentePrincipal = '556596105003@c.us';
const atendenteInstalacao = '556596193619@c.us';

// ✅ Controle de tempo
const cooldowns = {};
const TEMPO_ESPERA_MS = 60000; // 60s

// ✅ Controle de bloqueio pós-atendimento
const bloqueiosAtendimento = {};
const TEMPO_BLOQUEIO_MS = 6000; // 1 minuto

// ✅ Bot
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'cliente_kessio' }),
  puppeteer: {
    executablePath: puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  console.log('📲 Escaneie o QR nesse link:');
  console.log('🔗 https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr));
});
client.on('ready', () => console.log('✅ WhatsApp conectado!'));
client.initialize();

// ✅ Delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// ✅ Controle de etapas
const clientesTemp = {};

// ✅ Função para boletos
async function buscarBoletosAsaas(cpfCnpj, numeroUsuario) {
  try {
    const cliente = await axios.get(`https://www.asaas.com/api/v3/customers?cpfCnpj=${cpfCnpj}`, {
      headers: asaasHeaders
    });

    if (cliente.data.totalCount === 0) {
      return client.sendMessage(numeroUsuario, '❌ Nenhum cliente encontrado com esse CPF/CNPJ.');
    }

    const clienteId = cliente.data.data[0].id;
    const boletos = await axios.get(`https://www.asaas.com/api/v3/payments?customer=${clienteId}&status[]=PENDING&status[]=OVERDUE&status[]=DUE`, {
      headers: asaasHeaders
    });

    if (boletos.data.totalCount === 0) {
      return client.sendMessage(numeroUsuario, '✅ Nenhum boleto em aberto encontrado para esse cliente.');
    }

    let mensagem = '📄 *Boletos em aberto encontrados:*\n\n';
    boletos.data.data.forEach(boleto => {
      mensagem += `💰 Valor: R$ ${boleto.value}\n📅 Vencimento: ${boleto.dueDate}\n🔗 Link: ${boleto.invoiceUrl}\n\n`;
    });

    await client.sendMessage(numeroUsuario, mensagem);
  } catch (err) {
    console.error('Erro ao buscar boletos:', err.response?.data || err.message);
    await client.sendMessage(numeroUsuario, '❌ Ocorreu um erro ao buscar os boletos. Verifique o CPF/CNPJ informado.');
  }
}

// ✅ Menu principal
const menuMsg = `
📋 *Menu Principal:*

1️⃣ - Outros Serviços  
2️⃣ - Falar com Atendente  
3️⃣ - Segunda via de Boleto  
4️⃣ - Instalação de Internet
`;

client.on('message', async msg => {
  const chat = await msg.getChat();
  const contact = await msg.getContact();
  const name = contact.pushname || 'cliente';
  const userId = msg.from;
  const texto = msg.body.trim();
  const agora = Date.now();

  if (!clientesTemp[userId]) clientesTemp[userId] = {};
  const etapa = clientesTemp[userId].etapa;

  // ✅ Menu / Saudação
  if (/^(menu|voltar|oi|ol[aá]|bom dia|boa tarde|boa noite)/i.test(texto.toLowerCase())) {
    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from, `👋 Olá, ${name.split(" ")[0]}! Seja muito bem-vindo(a) ao atendimento da ALFAFIX 🌐 \nEstamos prontos para te ajudar! \n\nEscolha uma das opções abaixo para começar:.\n${menuMsg} \n\nDigite a qualquer momento *Menu* ou *Voltar* para abrir as opções novamente!`);
    clientesTemp[userId] = {};
    return;
  }

  // ✅ Bloqueio pós-atendimento
  if (bloqueiosAtendimento[userId]) {
    const aindaBloqueado = agora < bloqueiosAtendimento[userId];
    if (aindaBloqueado && !['menu', 'voltar'].includes(texto.toLowerCase())) return;
    delete bloqueiosAtendimento[userId];
    clientesTemp[userId] = {};
  }

  // ✅ Etapa: motivo do atendimento
  if (etapa === 'motivo-atendimento') {
    let resposta = '';
    let destino = '';

    switch (texto) {
      case '1':
        resposta = '🔧 Você será encaminhado para o setor técnico agora...';
        destino = atendenteTecnico;
        break;
      case '2':
        resposta = '💰 Você será atendido em breve para orçamento.';
        destino = atendentePrincipal;
        break;
      case '3':
        resposta = '📋 Um atendente geral vai continuar com você.';
        destino = atendentePrincipal;
        break;
      default:
        await client.sendMessage(msg.from, '❌ Opção inválida. Digite *1*, *2* ou *3*.');
        return;
    }

    const clienteNome = contact.pushname || 'cliente';
    const numeroFormatado = msg.from.replace('@c.us', '');
    const aviso = `📞 *Novo atendimento:*\n\n👤 *${clienteNome}*\n📱 wa.me/${numeroFormatado}\n📝 Motivo: ${resposta}`;

    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from, resposta);
    await client.sendMessage(destino, aviso);
    delete clientesTemp[userId];
    return;
  }

  // ✅ Etapa: buscar boleto
  if (etapa === 'buscar-boleto') {
    await chat.sendStateTyping();
    await delay(1000);
    await buscarBoletosAsaas(texto, msg.from);
    delete clientesTemp[userId];
    return;
  }

  // ✅ Opção 1 – Outros Serviços
  if (texto === '1') {
    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from,
      '📢 *Conheça os serviços oferecidos pela nossa empresa!* 💡 Oferecemos soluções completas para sua casa ou empresa:\n\n' +
      '🏗️ *Estrutura Metálica*\n🔆 *Placa Solar*\n🌐 *Instalação de Internet*\n🔧 *CFTV*\n⚡ *Cerca Elétrica*\n\n' +
      '📞 *Fale agora com um atendente* e peça seu orçamento sem compromisso!\n📍 *Atendemos toda a região.*');
    return;
  }

  // ✅ Opção 2 – Falar com Atendente
  if (texto === '2') {
    clientesTemp[userId].etapa = 'motivo-atendimento';
    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from,
      '📞 Sobre o que você gostaria de falar?\n\n' +
      '1️⃣ - Suporte técnico\n' +
      '2️⃣ - Orçamento\n' +
      '3️⃣ - Outros assuntos');
    return;
  }

  // ✅ Opção 3 – Segunda via de Boleto
  if (texto === '3') {
    clientesTemp[userId].etapa = 'buscar-boleto';
    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from, '🔎 Informe seu *CPF ou CNPJ* para buscar boletos em aberto:');
    return;
  }

  // ✅ Opção 4 – Instalação de Internet
  if (texto === '4') {
    const clienteNome = contact.pushname || 'cliente';
    const numeroFormatado = msg.from.replace('@c.us', '');
    const aviso = `📡 *Novo pedido de instalação de internet:*\n\n👤 *${clienteNome}*\n📱 wa.me/${numeroFormatado}`;

    await chat.sendStateTyping();
    await delay(1000);
    await client.sendMessage(msg.from, '🚀 Sua solicitação de *instalação de internet* foi recebida! Um atendente irá falar com você em instantes.');
    await client.sendMessage(atendenteInstalacao, aviso);
    return;
  }
  // Impede que o processo encerre automaticamente no Railway
setInterval(() => {}, 1000 * 60 * 60);
});
