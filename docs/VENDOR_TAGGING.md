# Vendor Guide: Making and Printing Price Tags

## What's New

Yakima Finds now lets you make price tags right from your computer or phone. You type in what the item is and what it costs, click a button, and a tag with a barcode prints out — no more handwriting. The barcode means the item rings up correctly at the register every time, with your booth getting credit automatically. This guide walks you through it step by step.

---

## 1. Logging In

Go to:

```
https://teamtime.yakimafinds.com/login
```

Sign in with the **email address** and **PIN** the shop gave you. (The PIN is a short number, not a long password. If you didn't get one, or you've lost it, ask any staff member at the shop and they'll set you up.)

After you log in, you'll land on your **vendor dashboard**. From there, click **Inventory** in the menu, or go directly to:

```
https://teamtime.yakimafinds.com/vendor/inventory
```

This is the page you'll use most.

---

## 2. Making Your First Tag

On the inventory page, look for the card titled **Make a tag**. It has two boxes:

1. **Description** — what the item is. Keep it short. Examples:
   - "Blue glass vase"
   - "Cast iron skillet, 10 inch"
   - "Vintage Pyrex bowl set"
2. **Price** — just the number. No dollar sign needed. Examples: `12.50`, `45`, `8.99`

Then click the button **Make Tag**.

That's it. The tag is now in the system. You'll see it appear in your list of items below the card, marked as **pending** (which means staff hasn't added it to the register's inventory yet — more on that below).

### What the system does for you

When you click **Make Tag**, the system automatically:

- Picks a unique **part number** for your item (you don't have to type one)
- Saves the description and price
- Queues the tag so staff can add it to the register

You don't need to worry about the part number format — it's handled for you. (If you're curious, see Section 6.)

---

## 3. Printing on a Zebra Label Printer

If you have a Zebra thermal label printer at home (the kind that prints sticky labels without ink), here's how to print your tags directly.

### One-time setup: Install Zebra Browser Print

Zebra Browser Print is a free helper program from Zebra. It's a tiny app that runs in your computer's tray (down by the clock) and lets your web browser talk to your printer.

Download it here:

```
https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html
```

Install it on your computer (Mac or Windows both work). After installing:

1. **Plug in your Zebra printer** with the USB cable and turn it on.
2. **Open Zebra Browser Print** (it should start automatically; you'll see a small icon in your tray).
3. In the Browser Print window, **set your Zebra printer as the default**. There's usually a dropdown or a "Set as default" button.

You only have to do this once.

### Printing a tag

After you've made a tag (Section 2), find it in your list of items. Click the button labeled:

```
🦓 Print on Zebra
```

Your printer should buzz and spit out the tag. Stick it on the item and bring the item to the shop.

### If you see the amber banner "Browser Print not detected"

That means the helper program isn't running. Check:

- Is the **Zebra Browser Print app** open in your tray? (Look for a small icon by the clock.) If not, open it from your Applications or Start menu.
- Is the **printer turned on** and **plugged into the USB port**?
- Is a **default printer** set in the Browser Print window?
- Try closing and reopening Browser Print, then **refresh the TeamTime page** (press F5 or Cmd-R) and click the print button again.

If the banner still shows after all that, ask staff for help.

---

## 4. Don't Have a Zebra Printer?

That's fine. You can still make tags from this page — the system saves them, and the part number is generated and ready to go.

For now, please bring your items to the shop and ask staff to print the tags for you. We're working on a feature that will let you print on regular **Avery sheet labels** with a normal home inkjet or laser printer. That's coming soon.

---

## 5. What's on the Tag

A typical Yakima Finds vendor tag has these things on it, top to bottom:

- **Your booth name** (e.g. "Storlie Relics")
- **A barcode** — the black-and-white pattern the register scans
- **The part number** in regular text (so a human can read it too)
- **The item description** you typed
- **The price**, in big bold letters
- **A footer line** (optional — could be your phone, "Thank you", etc.)

If you'd like to change what shows up on your tags — for example, hiding your phone number, or making the price bigger — ask staff. They can adjust your tag layout from the admin side.

---

## 6. Understanding Part Numbers

Every tag gets a unique part number. The format looks like this:

```
SR26580001
```

Broken down:

- **SR** — your booth's prefix (each vendor has their own; yours is set when you sign up)
- **2658** — a compact date code
  - **26** = the year (2026)
  - **5** = the month (May; April would be 4)
  - **8** = the day of the month (the 8th; the 11th would be 11)
  - Leading zeros are dropped, so May 8 = "58", April 11 = "411"
- **0001** — a counter, starting at 0001 and going up for each tag you make that day

So `SR26580001`, `SR26580002`, `SR26580003` are the first, second, and third tags Storlie Relics made on May 8, 2026.

You don't have to memorize this — the system handles all of it. But it's good to know each tag is unique, even if two vendors happen to be making tags at the exact same moment.

### "I don't see a prefix on my tags"

If your prefix is missing, your tags will still get part numbers, but they may look different. Ask staff to set your booth prefix on your vendor record — it takes them about 30 seconds.

---

## 7. Editing a Tag You Already Made

Right now, if you typo'd a price or description, the easiest fix is:

1. **Cancel** the pending tag (look for an X or "Cancel" button next to it in your list).
2. **Make a new tag** with the correct info.

We know that's not ideal — a real "edit" button is on our list for the next version. For now, cancel-and-redo is the way.

If the tag has already been **applied** to the register (no longer pending), ask staff to fix it on their end — they can update price or description in the POS.

---

## 8. What Happens After You Print

Here's the full journey of a tag once you make it:

1. **You make the tag** on `/vendor/inventory`. It shows as **pending**.
2. **You print it** (Zebra) or have staff print it (Avery, coming soon).
3. **You stick the tag** on your item and bring the item to the shop.
4. **Staff applies the pending tags** to the register's inventory system. Usually this happens once or twice a day.
5. Once applied, your item is officially in inventory and the tag is **ready to scan** at checkout.
6. When a customer buys it, the register reads the barcode, takes payment, and credits your booth. You'll see the sale show up in your reports.

If you scan a tag at the register and it doesn't ring up, that usually means staff hasn't applied it yet. Just let them know which item.

---

## 9. Common Problems

### "Browser Print not detected" banner stays even after I installed it

- Make sure the Browser Print **tray app is actually running**, not just installed. Open it from Applications (Mac) or Start menu (Windows).
- **Reload the TeamTime page** after starting Browser Print.
- Try a different USB port if the printer isn't being seen.

### Printer prints a totally blank label

- The label roll might be in **upside down** or shifted. Open the printer, reseat the roll so the heat-sensitive side faces up, and close it firmly.
- Try **calibrating** the printer (hold the feed button while powering on, until it beeps and feeds a few labels — check your printer's manual for the exact steps).

### Barcode prints but the register can't scan it

- The label may be too small for the barcode style. Ask staff to switch your tag to **Code 128** (a simpler 1D barcode that scans easily on any scanner).
- Check that the printhead is clean — a smudgy printhead leaves gaps in the barcode lines.

### My tags don't have my booth prefix on them

- Your vendor record probably doesn't have a prefix set yet. Ask staff to set it — once it's saved, all new tags will use it.

### I clicked "Make Tag" but nothing happened

- Make sure both **Description** and **Price** are filled in. The button won't do anything if either is empty.
- Refresh the page and try once more. If it still doesn't work, let staff know.

---

## 10. Need Help?

The shop staff at Yakima Finds set this whole system up and they're happy to walk you through it in person. Don't hesitate to ask — they'd rather spend five minutes helping you than have you struggle at home.

If you want to print tags from home but you're not sure what printer to buy, ask staff for a recommendation. The Zebra ZD410 is a popular choice for vendors and works great with this system.

Welcome to the new tag system, and thank you for selling with us.
