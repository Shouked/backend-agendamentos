const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const app = express();

app.use(express.json());
app.use(cors());

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
  email: String, // Novo campo para armazenar o e-mail do cliente
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

  // E-mail para o proprietário
  const msgProprietario = {
    to: 'kingshowk23@gmail.com', // Seu e-mail pessoal
    from: 'iagofonseca1992@hotmail.com', // E-mail verificado no SendGrid
    subject: 'Novo Agendamento Criado',
    text: `Um novo agendamento foi feito!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nCliente: ${cliente}\nTelefone: ${telefone}\nE-mail: ${email}\nCriado em: ${novoAgendamento.dataCriacao}`
  };
  console.log('Tentando enviar e-mail ao proprietário');
  await sgMail.send(msgProprietario);
  console.log('E-mail enviado ao proprietário com sucesso!');

  // E-mail para o cliente
  if (email) {
    const msgCliente = {
      to: email, // E-mail do cliente
      from: 'iagofonseca1992@hotmail.com', // E-mail verificado no SendGrid
      subject: 'Confirmação de Agendamento',
      text: `Seu agendamento foi confirmado!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nEstamos ansiosos para atendê-lo(a)!`
    };
    console.log('Tentando enviar e-mail ao cliente');
    await sgMail.send(msgCliente);
    console.log('E-mail enviado ao cliente com sucesso!');
  }

  res.status(201).send('Agendamento criado com sucesso!');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
