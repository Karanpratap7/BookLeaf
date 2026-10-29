// Idempotent seed: wipes and reloads users, books, KB chunks and a few demo tickets.
// Run: npm run db:seed (from repo root)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();

const { authors } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../bookleaf_sample_data.json"), "utf-8"),
);

// Knowledge Base, verbatim from the assignment brief. One chunk per section, tagged with the
// ticket category it serves so drafts only pull what they need.
const KB = [
  {
    category: "General Inquiry",
    title: "Company Overview",
    content:
      "BookLeaf Publishing is a self-publishing company operating in India and the US. We offer publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons). We handle cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for our authors. Our in-house printing facility and warehouse are located in Delhi. We also work with print partners including Repro India and Epitome Books.",
  },
  {
    category: "Royalty & Payments",
    title: "Royalty Policy",
    content:
      "BookLeaf follows an 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf. Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges. Royalties are calculated quarterly and paid within 45 days of the quarter ending. Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter. Payouts are made via bank transfer to the account linked in the author's dashboard. Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.",
  },
  {
    category: "ISBN & Metadata Issues",
    title: "ISBN Policy",
    content:
      "Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf. ISBNs are registered under BookLeaf's publisher imprint. If an author wants an ISBN under their own imprint, they need to obtain it independently. If an author reports an ISBN error (duplicate, wrong book linked), it is treated as a high-priority issue and escalated to the production team.",
  },
  {
    category: "ISBN & Metadata Issues",
    title: "Metadata Updates",
    content:
      "Metadata updates (such as the book description) can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.",
  },
  {
    category: "Printing & Quality",
    title: "Printing & Quality",
    content:
      "In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books. Standard print turnaround: 5–7 business days from order confirmation. If an author reports a quality issue (misprints, binding defects, color inconsistency), BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.",
  },
  {
    category: "Distribution & Availability",
    title: "Distribution & Availability",
    content:
      "Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store. New listings typically go live within 7–10 business days after publication is complete. If a book is showing as unavailable on a platform, it usually indicates a stock sync issue—BookLeaf's team can trigger a re-sync within 24–48 hours.",
  },
  {
    category: "Book Status & Production Updates",
    title: "Production Stages",
    content:
      "A book goes through the following stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live. Authors are updated at each stage via email. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).",
  },
  // Sample query → response guidance from the brief, used as calibration examples.
  {
    category: "Royalty & Payments",
    title: "Example: royalty not received",
    content:
      "Query: 'I published my book 4 months ago and still haven't received any royalty.' Response: Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check if their bank details are linked. Provide the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.",
  },
  {
    category: "Royalty & Payments",
    title: "Example: royalty seems too low",
    content:
      "Query: 'I sold 200 copies but only received ₹3,000.' Response: Explain the net profit calculation: MRP minus printing, platform commission, and shipping. Offer to share a detailed line-by-line royalty breakdown. Don't be defensive—offer transparency.",
  },
  {
    category: "ISBN & Metadata Issues",
    title: "Example: ISBN mismatch",
    content:
      "Query: 'My book is showing a different ISBN on Amazon than what's on the physical copy.' Response: Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.",
  },
  {
    category: "Printing & Quality",
    title: "Example: poor print quality",
    content:
      "Query: 'The print quality is terrible. The images are blurry and pages are misaligned.' Response: Apologise sincerely. Ask the author to share photos of the defective copies. Confirm that BookLeaf will arrange a free reprint once verified. Provide a timeline of 5–7 business days for the reprint.",
  },
  {
    category: "Distribution & Availability",
    title: "Example: currently unavailable",
    content:
      "Query: 'My book is published but it's showing as Currently Unavailable on Amazon.' Response: Explain that this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24–48 hours for it to go live again.",
  },
  {
    category: "Book Status & Production Updates",
    title: "Example: stuck in typesetting",
    content:
      "Query: 'It's been 3 weeks and my book is still in typesetting.' Response: Check the actual production status. If it's delayed, be honest about why (e.g., waiting on author approval for proofs). Provide a specific updated timeline. Don't blame the author even if the delay is on their side—frame it collaboratively.",
  },
  {
    category: "General Inquiry",
    title: "Example: update book description",
    content:
      "Query: 'Can I update the description of my book on Amazon after it's already live?' Response: Yes, metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.",
  },
];

// Demo tickets so the admin queue isn't empty for reviewers. Classification is pre-set here
// (seeding shouldn't spend tokens); live tickets are classified by the AI on creation.
const DEMO_TICKETS = [
  {
    email: "ananya.reddy@email.com",
    book: "Between Two Temples",
    subject: "No royalty received yet",
    description:
      "My book has been live for months and I can see sales, but I have never received a single royalty payment. What is going on?",
    category: "Royalty & Payments",
    priority: "Critical",
    hoursAgo: 72,
  },
  {
    email: "rohit.kapoor@email.com",
    book: "Code & Karma",
    subject: "Different ISBN on Amazon",
    description:
      "The ISBN shown on the Amazon listing is different from the one printed on my physical copies. Readers are confused.",
    category: "ISBN & Metadata Issues",
    priority: "High",
    hoursAgo: 30,
  },
  {
    email: "meera.nair@email.com",
    book: "Cardamom & Chaos",
    subject: "Showing 'Currently Unavailable' on Amazon",
    description: "My book is published but Amazon India shows it as Currently Unavailable since last week.",
    category: "Distribution & Availability",
    priority: "High",
    hoursAgo: 20,
  },
  {
    email: "kavita.deshmukh@email.com",
    book: "Raising Roots",
    subject: "Still in typesetting after 3 weeks",
    description: "It's been 3 weeks and Raising Roots is still in typesetting. When will it be done?",
    category: "Book Status & Production Updates",
    priority: "Medium",
    hoursAgo: 8,
  },
  {
    email: "farhan.sheikh@email.com",
    book: null,
    subject: "Update my author bio",
    description: "Can I update my author bio and the description of my book on Amazon now that it is live?",
    category: "General Inquiry",
    priority: "Low",
    hoursAgo: 2,
  },
];

async function seed() {
  // Children first (FK order).
  await prisma.internalNote.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.book.deleteMany();
  await prisma.kbChunk.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = bcrypt.hashSync("Admin@123", 10);
  const authorHash = bcrypt.hashSync("Author@123", 10);

  await prisma.user.createMany({
    data: [
      { email: "admin@bookleaf.com", passwordHash: adminHash, name: "Asha (Ops Lead)", role: "ADMIN" },
      { email: "support@bookleaf.com", passwordHash: adminHash, name: "Rahul (Support)", role: "ADMIN" },
    ],
  });

  const bookIds = {};
  const userIds = {};
  for (const a of authors) {
    const user = await prisma.user.create({
      data: {
        email: a.email.toLowerCase(),
        passwordHash: authorHash,
        name: a.name,
        role: "AUTHOR",
        authorId: a.author_id,
        phone: a.phone,
        city: a.city,
        joinedDate: new Date(a.joined_date),
        books: {
          create: a.books.map((b) => ({
            title: b.title,
            isbn: b.isbn,
            genre: b.genre,
            publicationDate: b.publication_date ? new Date(b.publication_date) : null,
            status: b.status,
            mrp: b.mrp,
            authorRoyaltyPerCopy: b.author_royalty_per_copy,
            totalCopiesSold: b.total_copies_sold ?? 0,
            totalRoyaltyEarned: b.total_royalty_earned ?? 0,
            royaltyPaid: b.royalty_paid ?? 0,
            royaltyPending: b.royalty_pending ?? 0,
            lastRoyaltyPayoutDate: b.last_royalty_payout_date ? new Date(b.last_royalty_payout_date) : null,
            printPartner: b.print_partner,
            availableOn: b.available_on,
          })),
        },
      },
      include: { books: true },
    });
    userIds[user.email] = user.id;
    for (const b of user.books) bookIds[b.title] = b.id;
  }

  await prisma.kbChunk.createMany({ data: KB });

  for (const t of DEMO_TICKETS) {
    const createdAt = new Date(Date.now() - t.hoursAgo * 3_600_000);
    await prisma.ticket.create({
      data: {
        authorId: userIds[t.email],
        bookId: t.book ? bookIds[t.book] : null,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        aiRationale: "Seeded demo ticket",
        createdAt,
        messages: { create: { senderRole: "AUTHOR", body: t.description, createdAt } },
      },
    });
  }

  console.log(
    `Seeded 2 admins, ${authors.length} authors, ${Object.keys(bookIds).length} books, ${KB.length} KB chunks, ${DEMO_TICKETS.length} demo tickets.`,
  );
}

seed()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
