const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const app = express();

// Configuração avançada de CORS
const corsOptions = {
  origin: 'https://biancadomingues.netlify.app', // Apenas o frontend específico
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
  credentials: false, // Não usamos credenciais por agora
  optionsSuccessStatus: 200 // Para compatibilidade
};

// Aplicar CORS a todas as rotas
app.use(cors(corsOptions));

// Garantir que requisições preflight (OPTIONS) sejam tratadas
app.options('*', cors(corsOptions));

app.use(express.json());

// Conexão com MongoDB Atlas
mongoose.connect('mongodb+srv://iagofonseca:Toldo+10@cluster0.oo8my.mongodb.net/agendamentos?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Conectado ao MongoDB!'))
.catch(err => console.log('Erro ao conectar:', err));

// Configurar SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Schema do agendamento
const agendamentoSchema = new mongoose.Schema({
  procedimento: String,
  data: String,
  horario: String,
  cliente: String,
  telefone: String,
  email: String,
  dataCriacao: { type: Date, default: Date.now }
});

// Schema do usuário
const usuarioSchema = new mongoose.Schema({
  email: String,
  senha: String
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);

// Rota de login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const usuario = await Usuario.findOne({ email, senha });
  if (usuario) {
    res.json({ success: true, message: 'Login bem-sucedido' });
  } else {
    res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
  }
});

// Rota para criar agendamento
app.post('/agendamentos', async (req, res) => {
  const { procedimento, data, horario, cliente, telefone, email } = req.body;
  const existente = await Agendamento.findOne({ data, horario });
  if (existente) {
    return res.status(400).json({ success: false, message: 'Este horário já está ocupado neste dia!' });
  }

  const novoAgendamento = new Agendamento({ procedimento, data, horario, cliente, telefone, email });
  await novoAgendamento.save();

  const msgProprietario = {
    to: 'kingshowk23@gmail.com', // E-mail do proprietário
    from: 'iagofonseca1992@hotmail.com', // E-mail verificado no SendGrid
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

// Rota para listar agendamentos
app.get('/agendamentos', async (req, res) => {
  const agendamentos = await Agendamento.find();
  res.json(agendamentos);
});

// Rota para horários disponíveis
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

// Rota para editar agendamento
app.put('/agendamentos/:id', async (req, res) => {
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

// Rota para excluir múltiplos agendamentos (deve vir antes de /:id)
app.delete('/agendamentos/muitos', async (req, res) => {
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

// Rota para excluir um agendamento (deve vir depois de /muitos)
app.delete('/agendamentos/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await Agendamento.findByIdAndDelete(id);
  if (deleted) {
    res.json({ success: true, message: 'Agendamento excluído com sucesso!' });
  } else {
    res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
