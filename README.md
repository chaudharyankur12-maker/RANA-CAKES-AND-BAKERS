# RANA CAKE & BAKERY – Order Server

QR scan → menu → order → **bakery ko apne aap notification** + **customer ka number save**.

## Isme kya hai

| Page | Kaam |
|---|---|
| `/` | Customer ka menu. Items ADD karke order confirm karta hai |
| `/admin` | Aapka page (password ke saath). Orders, status, customers ki list, offers |

- Order aate hi **Telegram** aur/ya **WhatsApp** pe alert jaata hai
- Admin page khula ho to naye order pe **beep** bajti hai (har 15 second check karta hai)
- Har customer ka **naam, number, kitne order, kitna kharcha** save hota hai
- Customers ki list **Excel (CSV)** mein download ho sakti hai
- Offer sirf unhe jaata hai jinhone order karte waqt **"offers chahiye" tick** kiya (WhatsApp ka rule hai, warna number block ho sakta hai)
- Price hamesha server calculate karta hai, customer price badal nahi sakta

## Files

```
server.js          ← backend
menu.json          ← MENU YAHAN BADLEIN (items, price, naam, address)
public/index.html  ← customer ka page
public/admin.html  ← admin page
.env.example       ← settings ka namuna
data/              ← orders.json aur customers.json yahan banenge
```

**Menu ya price badalna ho:** sirf `menu.json` edit karein aur server restart karein.
Koi item khatam ho jaye to us item mein `"stock": false` jod dein.

---

## Step 1: Apne computer pe chala ke dekhein

1. Node.js install karein (nodejs.org se LTS version)
2. Is folder mein terminal kholein:
   ```
   npm install
   ```
3. `.env.example` ko copy karke `.env` naam do, aur `ADMIN_PASSWORD` mein apna password likho
4. Chalao:
   ```
   npm start
   ```
5. Browser mein kholo: `http://localhost:3000` (menu) aur `http://localhost:3000/admin`

Abhi notification set nahi hai, to order terminal mein print hoga. Ab Step 2 karein.

---

## Step 2: Notification set karein

### Option A: Telegram (FREE, sabse aasaan, isse shuru karein)

1. Phone pe Telegram install karein
2. **@BotFather** search karein → `/newbot` bhejein → naam do (jaise "Rana Bakery Orders")
3. BotFather ek **token** dega (jaise `7123456789:AAH...`). Ye `.env` mein `TELEGRAM_BOT_TOKEN=` ke aage likhein
4. Apne naye bot ko kholke **Start** dabayein aur "hi" bhejein
5. Browser mein kholein (TOKEN ki jagah apna token):
   `https://api.telegram.org/botTOKEN/getUpdates`
   Wahan `"chat":{"id":123456789` dikhega. Ye number `TELEGRAM_CHAT_ID=` mein likhein
6. Server restart karein aur ek test order karein. Telegram pe order aa jayega 🔔

Ghar ke 2-3 log alerts chahte hain? Ek Telegram group banao, bot ko usme add karo, aur group ka chat id (minus wala number) use karo.

### Option B: WhatsApp Business API (Meta) – paid per message

Isse alert seedha WhatsApp pe aata hai, aur customers ko offers bhi bhej sakte ho.

**Zaroori baatein:**
- API ke liye ek **alag mobile number** chahiye jo normal WhatsApp app pe chalu na ho (aapka 9873562718 alert *receive* karega, wo API number nahi banega)
- Meta per message charge karta hai: order alert "Utility" category mein aata hai (sasta), offer "Marketing" category mein (thoda mehenga). Latest rates Meta ki pricing page pe dekhein.
- Har message ka **template** pehle Meta se approve karwana padta hai

**Setup:**
1. developers.facebook.com pe account banao → **Create App** → type "Business" → **WhatsApp** add karo
2. WhatsApp → API Setup mein **Phone number ID** milega → `WA_PHONE_NUMBER_ID`
3. Business Settings → System Users → ek system user banao → WhatsApp permissions ke saath **permanent token** banao → `WA_TOKEN`
4. Apna asli number add karo (Add phone number) aur verify karo
5. WhatsApp Manager → **Message Templates** mein do templates banao:

   **Template 1:** name `new_order`, category **Utility**, language **English**
   ```
   New order {{1}} from {{2}} ({{3}}). Items: {{4}}. Total: {{5}}. {{6}}. Note: {{7}}
   ```

   **Template 2:** name `bakery_offer`, category **Marketing**, language **English**
   ```
   Namaste {{1}} ji! {{2}} - RANA CAKE & BAKERY. Offers band karne ke liye STOP likhein.
   ```
6. Approve hone ke baad `.env` mein `WA_OWNER_NUMBER=919873562718` rakhein aur server restart karein

Agar kisi customer ne STOP likha, to admin page → Customers mein uske aage **"✅ Haan"** dabake **"❌ Nahi"** kar dein.

**Bina API ke offers:** Admin → Offer Bhejein mein message likho. Har customer ka WhatsApp button aa jayega, jo message ke saath aapka WhatsApp kholta hai. Free hai, bas ek-ek karke Send dabana padega.

---

## Step 3: Internet pe daalein (taaki QR se khule)

### Render.com (free se shuru)
1. Ye folder GitHub pe upload karein (`.env` upload **mat** karna, wo `.gitignore` mein hai)
2. render.com → New → **Web Service** → apna GitHub repo chunein
3. Build command: `npm install` · Start command: `npm start`
4. **Environment** mein `.env` wali saari values ek-ek karke daalein
5. Deploy ke baad link milega, jaise `https://rana-bakery.onrender.com`

⚠️ **Free plan ki 2 kamiyan:**
- 15 minute koi na aaye to server so jaata hai, aur agle customer ke liye pehli baar khulne mein ~1 minute lagta hai
- Restart/deploy pe `data/` folder saaf ho sakta hai (orders aur customer list mit sakti hai)

**Dukaan ke liye:** Render ka sabse sasta paid plan + **Persistent Disk** lein, disk ko `/var/data` pe mount karein, aur environment mein `DATA_DIR=/var/data` daalein. Tab data safe rahega aur site hamesha jaldi khulegi. Customer list ka backup admin page se CSV download karke bhi rakhte rahein.

### Apna domain (optional)
GoDaddy/Hostinger se `ranabakery.in` jaisa domain lekar Render mein "Custom Domain" add kar sakte hain.

---

## Step 4: Naya QR code
Server ka link milne ke baad us link ka QR banwa lein (Claude se bol dena). Purana QR claude.ai wale page pe jaata hai, wo is server pe nahi jayega.

## Privacy
Customer numbers sirf bakery ke kaam (order confirm karna, aur jinhone haan kaha unhe offers bhejna) ke liye use karein. Kisi aur ko na dein ya bechein. Jo offers band karna chahe, use turant band kar dein.
