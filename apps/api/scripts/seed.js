import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();

const authorsData = JSON.parse(
  fs.readFileSync(path.resolve("../bookleaf_sample_data.json"), "utf-8")
).authors;

const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
];

async function seed() {
  // 1. Create admin users
  const admin1 = await prisma.user.create({
    data: {
      email: "admin@bookleaf.com",
      passwordHash: "$2a$10$1uJjZVx3rJqbWV8v5e7fSe.y6yWvB2uCjY8L5Kk.z8Oe.dE.xYKYS", // Admin@123
      name: "System Admin",
      role: "ADMIN",
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      email: "support@bookleaf.com",
      passwordHash: "$2a$10$1uJjZVx3rJqbWV8v5e7fSe.y6yWvB2uCjY8L5Kk.z8Oe.dE.xYKYS",
      name: "Support Staff",
      role: "ADMIN",
    },
  });

  // 2. Create 10 authors with shared demo password
  const authors = [];
  const demoPassword = "$2a$10$1uJjZVx3rJqbWV8v5e7fSe.y6yWvB2uCjY8L5Kk.z8Oe.dE.xYKYS"; // Author@123

  for (const authorData of authorsData) {
    const author = await prisma.user.create({
      data: {
        email: authorData.email,
        passwordHash: demoPassword,
        name: authorData.name,
        role: "AUTHOR",
        phone: authorData.phone,
        city: authorData.city,
        joinedDate: new Date(authorData.joined_date),
      },
    });

    // 3. Create books for each author
    for (const bookData of authorData.books) {
      await prisma.book.create({
        data: {
          title: bookData.title,
          isbn: bookData.isbn,
          genre: bookData.genre,
          publicationDate: bookData.publication_date ? new Date(bookData.publication_date) : null,
          status: bookData.status,
          mrp: bookData.mrp,
          authorRoyaltyPerCopy: bookData.author_royalty_per_copy,
          totalCopiesSold: bookData.total_copies_sold,
          totalRoyaltyEarned: bookData.total_royalty_earned,
          royaltyPaid: bookData.royalty_paid,
          royaltyPending: bookData.royalty_pending,
          lastRoyaltyPayoutDate:
            bookData.last_royalty_payout_date !== null
              ? new Date(bookData.last_royalty_payout_date)
              : null,
          printPartner: bookData.print_partner,
          availableOn: bookData.available_on,
          authorId: author.id,
        },
      });
    }

    authors.push(author);
  }

  // 4. Seed KB chunks from Knowledge Base sections
  // Map categories to KB section titles based on the assignment
  const kbChunks = [
    // Royalty & Payments
    {
      category: "Royalty & Payments",
      title: "Royalty Basics",
      content:
        "Authors receive royalties per copy sold. Royalty rate is defined per book. Royalty earned = total_copies_sold × author_royalty_per_copy. Royalty is paid out after threshold is met, typically on a monthly cycle. Pending royalty is the unpaid amount awaiting payout.",
    },
    {
      category: "Royalty & Payments",
      title: "Payout Threshold",
      content:
        "Royalty payout occurs when earned royalty exceeds the minimum threshold. Payouts are processed on the 1st and 15th of each month. Authors are notified via email when a payout is initiated.",
    },
    {
      category: "Royalty & Payments",
      title: "Royalty Discrepancy",
      content:
        "If royalty earned differs from expected calculation, check for: partial sales returns, format change adjustments, or co-publishing splits. Contact accounting for reconciliation.",
    },
    // ISBN & Metadata Issues
    {
      category: "ISBN & Metadata Issues",
      title: "ISBN Validation",
      content:
        "All books must have a valid ISBN-13 format. Missing or incorrect ISBNs prevent distribution on major platforms. Verify ISBN matches the printed edition.",
    },
    {
      category: "ISBN & Metadata Issues",
      title: "Title/Author Update",
      content:
        "Title or author name changes require updated metadata submission. Allow 3–5 business days for platform synchronization. Old listings may remain live during transition.",
    },
    // Printing & Quality
    {
      category: "Printing & Quality",
      title: "Print Defects",
      content:
        "Report any printing defects (missing pages, color shifts, binding issues) with photographic evidence. Defective copies are quarantined and replacement orders are fulfilled within 14 business days.",
    },
    {
      category: "Printing & Quality",
      title: "Out of Print",
      content:
        "Books marked 'Out of Print' have ceased physical production. eBook versions may remain available. Authors requesting reprint must submit a formal request with minimum order quantity.",
    },
    // Distribution & Availability
    {
      category: "Distribution & Availability",
      title: "Platform Availability",
      content:
        "Books are available on Amazon India, Flipkart, Amazon US/UK, and BookLeaf Store. Availability on each platform is governed by individual retailer agreements. Stock levels are updated daily.",
    },
    {
      category: "Distribution & Availability",
      title: "Regional Restrictions",
      content:
        "Some editions have regional restrictions. India-only editions cannot be shipped to international addresses. Verify availability region before accepting orders.",
    },
    // Book Status & Production Updates
    {
      category: "Book Status & Production Updates",
      title: "In Production Workflow",
      content:
        "Books in production progress through stages: Cover Design → Typesetting → Proofing → Printing → Live. Status updates are reflected in the system within 48 hours of milestone completion.",
    },
    {
      category: "Book Status & Production Updates",
      title: "Delay Escalation",
      content:
        "Production delays beyond 30 days require stakeholder notification. Common causes: cover art revisions, typesetting errors, print partner capacity constraints.",
    },
    // General Inquiry
    {
      category: "General Inquiry",
      title: "General Submissions",
      content:
        "General inquiries about submissions, partnerships, or author services should be directed to the general contact channel. Response time is 3–5 business days.",
    },
    {
      category: "General Inquiry",
      title: "FAQ",
      content:
        "Q: How do I update my bank details for royalty payouts? A: Submit a support ticket with your new bank information. Q: How many books can I publish with BookLeaf? A: There is no limit on the number of titles.",
    },
  ];

  for (const chunk of kbChunks) {
    await prisma.kbChunk.create({
      data: chunk,
    });
  }

  console.log("✅ Database seeded successfully!");
  console.log(`   - 1 Admin account created`);
  console.log(`   - 1 Support admin created`);
  console.log(`   - 10 Author accounts created`);
  console.log(`   - ${kbChunks.length} KB chunks seeded`);

  await prisma.$disconnect();
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });