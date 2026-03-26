import dotenv from "dotenv";
dotenv.config();

export async function sendMessage(to, message) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const data = await response.json();

    console.log("WhatsApp API response:", data);

    return data?.messages?.[0]?.id || null;
  } catch (err) {
    console.error("Send error:", err.message);
    return null;
  }
}