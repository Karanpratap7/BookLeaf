const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = req.headers.authorization;
    let decoded;
    if (auth && auth.startsWith('Bearer ')) {
      decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET || 'secret');
    }
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    if (req.path.match(/^\/api\/admin\/tickets\/[^\/]+\/notes$/) && req.method === 'POST') {
      const ticketId = req.path.split('/').pop().replace('/notes', '');
      const { body } = req.body;
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) return res.status(404).json({ error: 'Not found' });
      if (decoded.role === 'AUTHOR' && ticket.authorId !== decoded.id) return res.status(403).json({ error: 'Forbidden' });
      const message = await prisma.ticketMessage.create({
        data: { ticketId, senderRole: decoded.role, body },
      });
      return res.json(message);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};