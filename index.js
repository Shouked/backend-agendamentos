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
  credentials: true,
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
  procedimento: { type: String, required: true },
  data: { type: String, required: true },
  horario: { type: String, required: true },
  cliente: { type: String, required: true },
  telefone: { type: String, required: true },
  email: { type: String, default: '' },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: false },
  dataCriacao: { type: Date, default: Date.now }
}, { _id: true });

const usuarioSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true }
});

const clienteSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  senha: { type: String },
  telefone: { type: String, unique: true, required: true },
  senhaOriginal: { type: String },
  dataCriacao: { type: Date, default: Date.now }
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);
const Cliente = mongoose.model('Cliente', clienteSchema);

const JWT_SECRET = process.env.JWT_SECRET;

const autenticarTokenProprietario = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido', error: err.message });
    req.usuario = usuario;
    next();
  });
};

const autenticarTokenCliente = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, cliente) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido', error: err.message });
    req.cliente = cliente;
    next();
  });
};

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await Usuario.findOne({ email });
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
    }
    const token = jwt.sign({ email: usuario.email, tipo: 'proprietario' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Login bem-sucedido', token });
  } catch (error) {
    console.error('Erro no login do proprietário:', error);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

app.post('/clientes/registro', async (req, res) => {
  let { nome, email, senha, telefone } = req.body;
  email = email.toLowerCase();
  nome = nome.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

  try {
    const emailExistente = await Cliente.findOne({ email });
    const telefoneExistente = await Cliente.findOne({ telefone });

    if (emailExistente && emailExistente.senha) {
      return res.status(400).json({ success: false, message: 'E-mail já registrado com senha!' });
    }
    if (telefoneExistente && telefoneExistente.senha) {
      return res.status(400).json({ success: false, message: 'Telefone já registrado com senha!' });
    }

    const senhaCriptografada = senha ? await bcrypt.hash(senha, 10) : null;
    let cliente;
    if (emailExistente) {
      cliente = emailExistente;
      cliente.nome = nome;
      cliente.senha = senhaCriptografada;
      cliente.senhaOriginal = senha;
      await cliente.save();
    } else if (telefoneExistente) {
      cliente = telefoneExistente;
      cliente.nome = nome;
      cliente.email = email;
      cliente.senha = senhaCriptografada;
      cliente.senhaOriginal = senha;
      await cliente.save();
    } else {
      cliente = new Cliente({ 
        nome, 
        email, 
        senha: senhaCriptografada, 
        telefone, 
        senhaOriginal: senha,
        dataCriacao: new Date()
      });
      await cliente.save();
    }

    const token = jwt.sign({ email: cliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ success: true, message: 'Cliente registrado com sucesso!', token });
  } catch (error) {
    console.error('Erro ao registrar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

app.post('/clientes/login', async (req, res) => {
  let { email, senha } = req.body;
  email = email.toLowerCase();
  try {
    const cliente = await Cliente.findOne({ email });
    if (!cliente) {
      return res.status(404).json({ success: false, message: 'E-mail não cadastrado' });
    }
    if (!cliente.senha) {
      return res.status(400).json({ success: false, message: 'Este e-mail foi cadastrado pelo proprietário. Registre uma senha primeiro.' });
    }
    if (!(await bcrypt.compare(senha, cliente.senha))) {
      return res.status(401).json({ success: false, message: 'Senha inválida' });
    }
    const token = jwt.sign({ email: cliente.email, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Login bem-sucedido', token });
  } catch (error) {
    console.error('Erro no login do cliente:', error);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

app.post('/clientes/esqueci-senha', async (req, res) => {
  let { email } = req.body;
  email = email.toLowerCase();
  try {
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
    await sgMail.send(mensagem);
    res.json({ success: true, message: 'E-mail de recuperação enviado com sua senha!' });
  } catch (error) {
    console.error('Erro ao enviar e-mail de recuperação:', error);
    res.status(500).json({ success: false, message: 'Erro ao enviar e-mail de recuperação' });
  }
});

app.get('/clientes/perfil', autenticarTokenCliente, async (req, res) => {
  try {
    const cliente = await Cliente.findOne({ email: req.cliente.email }, 'nome email telefone');
    if (!cliente) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }
    res.json({ success: true, cliente });
  } catch (error) {
    console.error('Erro ao buscar perfil do cliente:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao buscar perfil' });
  }
});

app.post('/agendaments', async (req, res) => {
  const token = req.headers['authorization'];
  let decoded = null;
  if (token) {
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Token inválido', error: err.message });
    }
  }

  let { procedimento, data, horario, cliente, telefone, email } = req.body;
  const procedimentosValidos = ['Extensão de Cílios', 'Lábios', 'Sobrancelha'];
  if (!procedimentosValidos.includes(procedimento)) {
    return res.status(400).json({ success: false, message: 'Procedimento inválido!' });
  }

  if (decoded && decoded.tipo === 'cliente') {
    const clienteDoc = await Cliente.findOne({ email: decoded.email });
    if (clienteDoc) {
      cliente = clienteDoc.nome;
      telefone = clienteDoc.telefone;
      email = clienteDoc.email;
    }
  } else {
    cliente = cliente.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    email = email ? email.toLowerCase() : '';
  }

  try {
    const existente = await Agendamento.findOne({ data, horario });
    if (existente) {
      return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
    }

    let clienteDoc = await Cliente.findOne({ telefone });
    if (!clienteDoc && !decoded) {
      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Forneça um e-mail válido com "@" para novos clientes!' });
      }
      clienteDoc = new Cliente({
        nome: cliente,
        email,
        telefone,
        dataCriacao: new Date()
      });
      await clienteDoc.save();
      console.log('Novo cliente criado:', clienteDoc);
    } else if (!decoded) {
      email = clienteDoc.email;
    }

    let clienteId = null;
    if (decoded && decoded.tipo === 'cliente') {
      const clienteAutenticado = await Cliente.findOne({ email: decoded.email });
      if (clienteAutenticado) clienteId = clienteAutenticado._id;
    } else if (decoded && decoded.tipo === 'proprietario') {
      clienteId = clienteDoc._id;
    }

    const novoAgendamento = new Agendamento({ 
      procedimento, 
      data, 
      horario, 
      cliente, 
      telefone, 
      email,
      clienteId,
      dataCriacao: new Date()
    });
    const savedAgendamento = await novoAgendamento.save();
    console.log('Agendamento salvo no MongoDB:', savedAgendamento);

    const msgProprietario = {
      to: 'kingshowk23@gmail.com',
      from: 'iagofonseca1992@hotmail.com',
      subject: 'Novo Agendamento Criado',
      text: `Um novo agendamento foi feito!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nCliente: ${cliente}\nTelefone: ${telefone}\nE-mail: ${email}\nCriado em: ${savedAgendamento.dataCriacao}`
    };
    await sgMail.send(msgProprietario).catch(err => console.error('Erro ao enviar e-mail ao proprietário:', err));

    if (email) {
      const msgCliente = {
        to: email,
        from: 'iagofonseca1992@hotmail.com',
        subject: 'Confirmação de Agendamento',
        text: `Seu agendamento foi confirmado!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nEstamos ansiosos para atendê-lo(a)!`
      };
      await sgMail.send(msgCliente).catch(err => console.error('Erro ao enviar e-mail ao cliente:', err));
    }

    res.status(201).json({ success: true, message: 'Agendamento criado com sucesso!', agendamento: savedAgendamento });
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao criar agendamento' });
  }
});

app.get('/agendamentos', autenticarTokenProprietario, async (req, res) => {
  try {
    const agendamentos = await Agendamento.find();
    res.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao buscar agendamentos' });
  }
});

app.get('/clientes/agendamentos', autenticarTokenCliente, async (req, res) => {
  try {
    const agendamentos = await Agendamento.find({ email: req.cliente.email });
    res.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos do cliente:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao buscar agendamentos' });
  }
});

app.get('/horarios-disponiveis', async (req, res) => {
  const { data } = req.query;
  try {
    const agendamentos = await Agendamento.find({ data });
    const todosHorarios = [
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
    ];
    const horariosOcupados = agendamentos.map(ag => ag.horario);
    const horariosDisponiveis = todosHorarios.filter(h => !horariosOcupados.includes(h));
    res.json(horariosDisponiveis);
  } catch (error) {
    console.error('Erro ao buscar horários disponíveis:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao buscar horários' });
  }
});

app.get('/relatorios/agendamentos-por-dia', autenticarTokenProprietario, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao gerar relatório' });
  }
});

app.get('/clientes', autenticarTokenProprietario, async (req, res) => {
  try {
    const clientes = await Cliente.find({}, 'nome email telefone dataCriacao');
    res.json(clientes);
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao buscar clientes' });
  }
});

app.delete('/clientes/muitos', autenticarTokenProprietario, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum cliente selecionado para exclusão!' });
  }

  try {
    const result = await Cliente.deleteMany({ _id: { $in: ids } });
    if (result.deletedCount > 0) {
      res.json({ success: true, message: `${result.deletedCount} cliente(s) excluído(s) com sucesso!` });
    } else {
      res.status(404).json({ success: false, message: 'Nenhum cliente encontrado para exclusão!' });
    }
  } catch (error) {
    console.error('Erro ao excluir clientes:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao excluir clientes' });
  }
});

app.put('/agendamentos/:id', autenticarTokenProprietario, async (req, res) => {
  const { id } = req.params;
  let { procedimento, data, horario, cliente, telefone, email } = req.body;
  const procedimentosValidos = ['Extensão de Cílios', 'Lábios', 'Sobrancelha'];
  if (!procedimentosValidos.includes(procedimento)) {
    return res.status(400).json({ success: false, message: 'Procedimento inválido!' });
  }

  email = email ? email.toLowerCase() : '';
  cliente = cliente.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

  try {
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
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao atualizar agendamento' });
  }
});

app.put('/clientes/agendamentos/:id', autenticarTokenCliente, async (req, res) => {
  const { id } = req.params;
  let { procedimento, data, horario } = req.body;
  try {
    const agendamento = await Agendamento.findById(id);
    if (!agendamento || agendamento.email !== req.cliente.email) {
      return res.status(403).json({ success: false, message: 'Você não tem permissão para editar este agendamento!' });
    }

    const procedimentosValidos = ['Extensão de Cílios', 'Lábios', 'Sobrancelha'];
    if (procedimento && !procedimentosValidos.includes(procedimento)) {
      return res.status(400).json({ success: false, message: 'Procedimento inválido!' });
    }

    if (data && horario) {
      const existente = await Agendamento.findOne({ data, horario, _id: { $ne: id } });
      if (existente) {
        return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
      }
    }

    const updated = await Agendamento.findByIdAndUpdate(id, { procedimento, data, horario }, { new: true });
    if (updated) {
      res.json({ success: true, message: 'Agendamento atualizado com sucesso!', agendamento: updated });
    } else {
      res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao atualizar agendamento do cliente:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao atualizar agendamento' });
  }
});

app.delete('/agendamentos/muitos', autenticarTokenProprietario, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum agendamento selecionado para exclusão!' });
  }

  try {
    const result = await Agendamento.deleteMany({ _id: { $in: ids } });
    if (result.deletedCount > 0) {
      res.json({ success: true, message: `${result.deletedCount} agendamento(s) excluído(s) com sucesso!` });
    } else {
      res.status(404).json({ success: false, message: 'Nenhum agendamento encontrado para exclusão!' });
    }
  } catch (error) {
    console.error('Erro ao excluir agendamentos:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao excluir agendamentos' });
  }
});

app.delete('/agendamentos/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
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
  } catch (error) {
    console.error('Erro ao excluir agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao excluir agendamento' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
