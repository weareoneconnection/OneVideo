import { db } from "../lib/db";
import { ensureDemoUser, runProjectWorkflow } from "../lib/workflow";

async function main() {
  const user = await ensureDemoUser();
  const project = await db.project.create({
    data: {
      userId: user.id,
      topic: "OneAI is evolving into a commercial AI infrastructure platform with model routing, task intelligence, cost control and Agent OS-ready workflows.",
      platform: "tiktok",
      language: "en",
      aspectRatio: "9:16",
      durationSeconds: 45,
      style: "cinematic AI startup launch video",
      status: "created"
    }
  });
  await runProjectWorkflow(project.id);
  console.log(`Seed complete: ${project.id}`);
}

main().finally(async () => db.$disconnect());
