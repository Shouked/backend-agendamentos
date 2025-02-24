const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail'); // Adicionando SendGrid
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
sgMail.setApiKey('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'); // Substitua pela chave do SendGrid

// Schema do agendamento
const agendamentoSchema = new mongoose.Schema({
  procedimento: String,
  data: String,
  horario: String,
  cliente: String,
  telefone: String,
  dataCriacao: { type: Date, default: Date.now } // Adicionando dataCriacao
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);

// Rota para criar agendamento
app.post('/agendamentos', async (req, res) => {
  const { procedimento, data, horario, cliente, telefone } = req.body; // Adicionando telefone
  const novoAgendamento = new Agendamento({ procedimento, data, horario, cliente, telefone });
  await novoAgendamento.save();

  // Enviar e-mail
  const msg = {
    to: 'iagofonseca1992@hotmail.com', // Seu e-mail pessoal
    from: 'iagofonseca1992@hotmail.com', // E-mail verificado no SendGrid
    subject: 'Novo Agendamento Criado',
    text: `Um novo agendamento foi feito!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nCliente: ${cliente}\nTelefone: ${telefone}\nCriado em: ${novoAgendamento.dataCriacao}`
  };
  console.log('Tentando enviar e-mail');
  await sgMail.send(msg);

  res.status(201).send('Agendamento criado com sucesso!');
});

// Rota para listar agendamentos
app.get('/agendamentos', async (req, res) => {
  const agendamentos = await Agendamento.find();
  res.json(agendamentos);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
