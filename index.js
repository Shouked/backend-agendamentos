const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();

const corsOptions = {
  origin: 'https://biancadomingues.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ type: 'application/json', charset: 'utf-8' }));
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado ao MongoDB!'))
  .catch(err => console.log('Erro ao conectar:', err));

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const agendamentoSchema = new mongoose.Schema({
  procedimento: String,
  data: String,
  horario: String,
  cliente: String,
  telefone: String,
  email: String,
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: false },
  dataCriacao: { type: Date, default: Date.now }
});

const usuarioSchema = new mongoose.Schema({
  email: String,
  senha: String
});

const clienteSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  senha: String,
  telefone: { type: String, unique: true },
  senhaOriginal: String
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);
const Cliente = mongoose.model('Cliente', clienteSchema);

const JWT_SECRET = process.env.JWT_SECRET;

const autenticarTokenProprietario = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
    req.usuario = usuario;
    next();
  });
};

const autenticarTokenCliente = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, cliente) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
    req.cliente = cliente;
    next();
  });
};

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const usuario = await Usuario.findOne({ email });
  if (usuario && await bcrypt.compare(senha, usuario.senha)) {
    const token = jwt.sign({ email: usuario.email, tipo: 'proprietario' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Login bem-sucedido', token });
  } else {
    res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
  }
});

app.post('/clientes/registro', async (req, res) => {
  let { nome, email, senha, telefone } = req.body;
  email = email.toLowerCase();
  nome = nome.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

  const emailExistente = await Cliente.findOne({ email });
  const telefoneExistente = await Cliente.findOne({ telefone });
  if (emailExistente) {
    return res.status(400).json({ success: false, message: 'E-mail já registrado!' });
  }
  if (telefoneExistente) {
    return res.status(400).json({ success: false, message: 'Telefone já registrado!' });
  }

  const senhaCriptografada = await bcrypt.hash(senha, 10);
  const novoCliente = new Cliente({ 
    nome, 
    email, 
    senha: senhaCriptografada, 
    telefone, 
    senhaOriginal: senha 
  });
  await novoCliente.save();

  const token = jwt.sign({ email: novoCliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({ success: true, message: 'Cliente registrado com sucesso!', token });
});

app.post('/clientes/login', async (req, res) => {
  let { email, senha } = req.body;
  email = email.toLowerCase();
  const cliente = await Cliente.findOne({ email });
  if (!cliente) {
    return res.status(404).json({ success: false, message: 'E-mail não cadastrado' });
  }
  if (await bcrypt.compare(senha, cliente.senha)) {
    const token = jwt.sign({ email: cliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Login bem-sucedido', token });
  } else {
    res.status(401).json({ success: false, message: 'Senha inválida' });
  }
});

app.post('/clientes/esqueci-senha', async (req, res) => {
  let { email } = req.body;
  email = email.toLowerCase();
  const cliente = await Cliente.findOne({ email });
  if (!cliente) {
    return res.status(404).json({ success: false, message: 'E-mail não encontrado!' });
  }

  const mensagem = {
    to: email,
    from: 'iagofonseca1992@hotmail.com',
    subject: 'Recuperação de Senha',
    text: `Olá ${cliente.nome},\n\nVocê solicitou a recuperação da sua senha. Aqui está a senha que você criou ao se registrar:\n\nSenha: ${cliente.senhaOriginal}\n\nUse-a para fazer login. Recomendamos que altere sua senha após acessar o sistema.\n\nAtenciosamente,\nEquipe de Agendamento`
  };
  await sgMail.send(mensagem).catch(err => console.error('Erro ao enviar e-mail:', err));
  res.json({ success: true, message: 'E-mail de recuperação enviado com sua senha!' });
});

app.post('/agendamentos', async (req, res, next) => {
  // Middleware de autenticação opcional
  const token = req.headers['authorization'];
  let decoded = null;
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) decoded = user;
    });
  }

  let { procedimento, data, horario, cliente, telefone, email } = req.body;
  const procedimentosValidos = ['Extensão de Cílios', 'Lábios', 'Sobrancelha'];
  if (!procedimentosValidos.includes(procedimento)) {
    return res.status(400).json({ success: false, message: 'Procedimento inválido!' });
  }

  email = email.toLowerCase();
  cliente = cliente.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

  const existente = await Agendamento.findOne({ data, horario });
  if (existente) {
    return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
  }

  const novoAgendamento = new Agendamento({ 
    procedimento, 
    data, 
    horario, 
    cliente, 
    telefone, 
    email,
    clienteId: decoded && decoded.tipo === 'cliente' ? (await Cliente.findOne({ email: decoded.email }))._id : null
  });
  await novoAgendamento.save();

  const msgProprietario = {
    to: 'kingshowk23@gmail.com',
    from: 'iagofonseca1992@hotmail.com',
    subject: 'Novo Agendamento Criado',
    text: `Um novo agendamento foi feito!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nCliente: ${cliente}\nTelefone: ${telefone}\nE-mail: ${email}\nCriado em: ${novoAgendamento.dataCriacao}`
  };
  console.log('Tentando enviar e-mail ao proprietário');
  await sgMail.send(msgProprietario).catch(err => console.error('Erro ao enviar e-mail ao proprietário:', err));

  if (email) {
    const msgCliente = {
      to: email,
      from: 'iagofonseca1992@hotmail.com',
      subject: 'Confirmação de Agendamento',
      text: `Seu agendamento foi confirmado!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nEstamos ansiosos para atendê-lo(a)!`
    };
    console.log('Tentando enviar e-mail ao cliente');
    await sgMail.send(msgCliente).catch(err => console.error('Erro ao enviar e-mail ao cliente:', err));
  }

  res.status(201).json({ success: true, message: 'Agendamento criado com sucesso!' });
});

app.get('/agendamentos', autenticarTokenProprietario, async (req, res) => {
  const agendamentos = await Agendamento.find();
  res.json(agendamentos);
});

app.get('/clientes/agendamentos', autenticarTokenCliente, async (req, res) => {
  const agendamentos = await Agendamento.find({ email: req.cliente.email });
  res.json(agendamentos);
});

app.get('/horarios-disponiveis', async (req, res) => {
  const { data } = req.query;
  const agendamentos = await Agendamento.find({ data });
  const todosHorarios = [
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
  ];
  const horariosOcupados = agendamentos.map(ag => ag.horario);
  const horariosDisponiveis = todosHorarios.filter(h => !horariosOcupados.includes(h));
  res.json(horariosDisponiveis);
});

app.get('/relatorios/agendamentos-por-dia', autenticarTokenProprietario, async (req, res) => {
  const agendamentos = await Agendamento.aggregate([
    {
      $group: {
        _id: "$data",
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id": 1 } }
  ]);
  res.json(agendamentos);
});

app.put
