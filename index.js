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
app.use(express.json());

mongoose.connect('mongodb+srv://iagofonseca:Toldo+10@cluster0.oo8my.mongodb.net/agendamentos?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
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
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
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
  telefone: { type: String, unique: true }
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);
const Cliente = mongoose.model('Cliente', clienteSchema);

const JWT_SECRET = 'sua-chave-secreta-super-segura';

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
  const { nome, email, senha, telefone } = req.body;
  const emailExistente = await Cliente.findOne({ email });
  const telefoneExistente = await Cliente.findOne({ telefone });
  if (emailExistente) {
    return res.status(400).json({ success: false, message: 'E-mail já registrado!' });
  }
  if (telefoneExistente) {
    return res.status(400).json({ success: false, message: 'Telefone já registrado!' });
  }

  const senhaCriptografada = await bcrypt.hash(senha, 10);
  const novoCliente = new Cliente({ nome, email, senha: senhaCriptografada, telefone });
  await novoCliente.save();

  const token = jwt.sign({ email: novoCliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({ success: true, message: 'Cliente registrado com sucesso!', token });
});

app.post('/clientes/login', async (req, res) => {
  const { email, senha } = req.body;
  const cliente = await Cliente.findOne({ email });
  if (cliente && await bcrypt.compare(senha, cliente.senha)) {
    const token = jwt.sign({ email: cliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Login bem-sucedido', token });
  } else {
    res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
  }
});

app.post('/clientes/esqueci-senha', async (req, res) => {
  const { email } = req.body;
  const cliente = await Cliente.findOne({ email });
  if (!cliente) {
    return res.status(404).json({ success: false, message: 'E-mail não encontrado!' });
  }

  const mensagem = {
    to: email,
    from: 'iagofonseca1992@hotmail.com',
    subject: 'Recuperação de Senha',
    text: `Olá ${cliente.nome},\n\nVocê solicitou recuperação de senha. Por favor, entre em contato com o suporte para redefinir sua senha.\n\nAtenciosamente,\nEquipe de Agendamento`
  };
  await sgMail.send(mensagem).catch(err => console.error('Erro ao enviar e-mail:', err));
  res.json({ success: true, message: 'E-mail de recuperação enviado!' });
});

app.post('/agendamentos', async (req, res) => {
  const { procedimento, data, horario, cliente, telefone, email } = req.body;
  const existente = await Agendamento.findOne({ data, horario });
  if (existente) {
    return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
  }

  const novoAgendamento = new Agendamento({ procedimento, data, horario, cliente, telefone, email });
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

app.put('/agendamentos/:id', autenticarTokenProprietario, async (req, res) => {
  const { id } = req.params;
  const { procedimento, data, horario, cliente, telefone, email } = req.body;
  const existente = await Agendamento.findOne({ data, horario, _id: { $ne: id } });
  if (existente) {
    return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
  }

  const updated = await Agendamento.findByIdAndUpdate(id, { procedimento, data, horario, cliente, telefone, email }, { new: true });
  if (updated) {
    res.json({ success: true, message: 'Agendamento atualizado com sucesso!', agendamento: updated });
  } else {
    res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
  }
});

app.put('/clientes/agendamentos/:id', autenticarTokenCliente, async (req, res) => {
  const { id } = req.params;
  const { procedimento, data, horario } = req.body;
  const agendamento = await Agendamento.findById(id);
  if (!agendamento || agendamento.email !== req.cliente.email) {
    return res.status(403).json({ success: false, message: 'Você não tem permissão para editar este agendamento!' });
  }

  const existente = await Agendamento.findOne({ data, horario, _id: { $ne: id } });
  if (existente) {
    return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
  }

  const updated = await Agendamento.findByIdAndUpdate(id, { procedimento, data, horario }, { new: true });
  if (updated) {
    res.json({ success: true, message: 'Agendamento atualizado com sucesso!', agendamento: updated });
  } else {
    res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
  }
});

app.delete('/agendamentos/muitos', autenticarTokenProprietario, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum agendamento selecionado para exclusão!' });
  }

  const result = await Agendamento.deleteMany({ _id: { $in: ids } });
  if (result.deletedCount > 0) {
    res.json({ success: true, message: `${result.deletedCount} agendamento(s) excluído(s) com sucesso!` });
  } else {
    res.status(404).json({ success: false, message: 'Nenhum agendamento encontrado para exclusão!' });
  }
});

app.delete('/agendamentos/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido' });

    const agendamento = await Agendamento.findById(id);
    if (!agendamento) {
      return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
    }

    if (decoded.tipo === 'proprietario' || (decoded.tipo === 'cliente' && agendamento.email === decoded.email)) {
      await Agendamento.findByIdAndDelete(id);
      res.json({ success: true, message: 'Agendamento excluído com sucesso!' });
    } else {
      res.status(403).json({ success: false, message: 'Você não tem permissão para excluir este agendamento!' });
    }
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
