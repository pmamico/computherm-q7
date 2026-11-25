# A Computherm Q7 programozási modellje

Forrás: a gyártó (Quantrax Kft., 2018) magyar [kezelési útmutatója](https://files.szerelvenybolt.hu/pdf_2019/Computherm/Computherm_Q7_hasznalati_utasitas.pdf).
Zárójelben az útmutató fejezetszáma. Ami nem az útmutatóból, hanem feltételezés, azt **[F]** jelöli.

## Gombok (újabb Q7)

| Gomb | Hol | Mire |
|---|---|---|
| `+` / `−` | nagy gombok az előlapon, a kijelző mellett | érték léptetése (nap, óra, perc, hőfok, időtartam) |
| `SET` | kis gomb | alapképernyő, mentés/nyugtázás; nyomva tartva + másik gomb = beállító menük |
| `DAY` | kis gomb | nap és pontos idő; programozás közben egy időpont törlése (`--:--`) |
| `PROG` | kis gomb | programozásban rögzít és továbblép; alapképernyőn programellenőrzés |
| `COPY` | kis gomb | egy nap programjának másolása (3 s nyomva) |
| `HOLD` | kis gomb | tartós kézi hőfok (röviden) / szabadságprogram (2 s) |
| `LIGHT` | kis gomb | háttérvilágítás |
| `RESET` | a burkolaton belül, az alappanelen | gyári alaphelyzet (mindent töröl) |

A kis gombok pontos elhelyezkedését az útmutató nem írja le; az app ábrája sematikus. **[F]**

## Kijelző

Felső sor: napok (`MON TUE WED THU FRI SAT SUN`). Bal: pontos idő / hátralévő idő (`TIME`, `TIME LEFT`).
Középen: programszám (`PROG 0–6`). Jobb: beállított hőfok (`SET TEMP`). Alul: mért hőmérséklet (`ROOM TEMP`).
Ikonok: kézi módosítás (kéz), kulcs (tartós kézi), bőrönd (időzített kézi), elem, kazán bekapcsolva (hullámok). (6. oldal)

## Heti program (4.1)

- Napokra külön-külön, egymástól független program; 7 naponta ismétlődik.
- Naponta `PROG 0` (rögzített, **00:00**, csak a hőfoka állítható, gyárilag **20 °C**) + legfeljebb 6 szabad
  kapcsolás (`PROG 1–6`).
- `PROG 1–6` időpontja **00:10 … 23:50**, **10 perces** lépésben, szigorúan növekvő sorrendben, egymástól min. 10 perc.
  Gyárilag inaktívak (`--:--`), új kapcsolás gyári hőfoka **20 °C**.
- Hőfok **5–40 °C**, **0,5 °C** lépésben. Egy kapcsolás hőfoka a következő kapcsolásig érvényes.
- Az összes nap egyszerre is programozható (minden szótag együtt villog), de akkor csak együtt módosítható.
- Fűtés és hűtés módhoz külön program tárolódik.

→ Az app ebből a modellből dolgozik: egy nap = 144 db 10 perces cella hőfoka; a változási pontokból lesznek a
kapcsolások (az első mindig 00:00 = `PROG 0`), és legfeljebb 7 pont lehet naponta.

## Gombsorozatok

**Alapképernyő:** `SET`.

**Nap és idő (3.2):** `SET` → `DAY` (nap villog) → `+/−` → `DAY` (óra villog) → `+/−` → `DAY` (perc villog) → `+/−` → `SET`.
15 s tétlenség után magától nyugtáz.

**Fűtés/hűtés (3.3):** `SET` → `SET` nyomva + `COPY` → az óra helyén `HEAT`/`COOL` → `+/−` → `SET`.

**Kapcsolási érzékenység (3.4):** `SET` → `DAY`, `COPY` → `+/−` (±0,1/0,2/0,3) → `SET`.
**Szivattyúvédő (3.5):** `SET` → `DAY`, `PROG` → `+/−` → `SET`.
**Kalibrálás (3.6):** `SET` → `DAY`, `HOLD` → `+/−` (−3,0…+3,0 °C) → `SET`.

**Programozás (4.3):**
1. `SET`, majd `SET` nyomva + `PROG` → a nap(ok) szótagja villog.
2. `+/−`: nap kiválasztása (vagy mind a 7 együtt) → `PROG`.
3. `PROG 0` hőfoka villog → `+/−` → `PROG`.
4. `PROG 1` időpontja villog → `+/−` → `PROG`; `PROG 1` hőfoka → `+/−` → `PROG`. Ugyanígy `PROG 2…6`.
5. A nap lezárása: ha a következő felkínált időpont `--:--`, `PROG` → újra napválasztás (2. lépés).
   6 kapcsolás után a nap magától lezárul.
6. `SET` ment (1 perc tétlenség után magától is).

**Meglévő kapcsolás törlése (4.5):** időpont szerkesztése közben `DAY` egyszer (vagy `+/−`-szal `--:--`-ra) → `PROG`;
a további kapcsolások újraszámozódnak. A nap módosításának befejezése: `PROG` 3 s-ig.
Teljesen új programhoz a `RESET` is használható (de az órát is törli).

**Másolás (4.4):** `SET` → `COPY` ~3 s (az óra helyén `COPY`, a `MON` villog) → `+/−` forrásnap → `COPY` →
`+/−` célnap → `COPY` (ismételhető további napokra) → `SET`. Csak napokra külön programozott programnál működik.

**Ellenőrzés (4.6):** `SET` → `PROG` (többször: `PROG 0`, `1`, …) → `+/−` napváltás → `SET`.

**Kézi módosítás (5.):**
- következő kapcsolásig: `+/−`; az első nyomás a gyári komfort (`+` → 22 °C) / takarék (`−` → 18 °C) értékre ugrik;
- 1–99 óra (party): `+/−`, majd `DAY`, majd `+/−` az órák száma; ~10 s múlva indul;
- 1–99 nap (szabadság): `+/−`, majd `HOLD` 2 s, majd `+/−` a napok száma;
- tartósan: `+/−`, majd `HOLD` röviden;
- vissza a programhoz: `SET`.
- Komfort/takarék gyorsérték átírása: `SET` nyomva + `+` (komfort) vagy `−` (takarék) → `+/−` → `SET`.

**Gombzár (7.):** `SET`, majd `+` és `−` együtt 5 s. **Háttérvilágítás (6.):** `LIGHT` (5 s: automatikus mód).

## Feltételezések [F]

- A `+/−` gombok nyomva tartva gyorsabban léptetnek (az útmutató ezt nem írja; ha nem, nyomogatni kell).
- A napválasztásnál a `+/−` körbejár a napokon és a „minden nap” állapoton; az app ezért nem nyomásszámot,
  hanem a célállapotot írja le („amíg csak a `TUE` villog”).
- Időpontoknál nem ismert, hogy `--:--`-ról hova ugrik az első `+`; az app itt is a célértéket mutatja.

## Típusváltozatok

A fenti leírás az **újabb Q7**-re vonatkozik (2018-as útmutató). A régebbi füzetek alapján az app négy változatot ismer:

| Változat | Kis gombok | Napok | Program | Hőfok | COPY |
|---|---|---|---|---|---|
| Q7 – újabb | SET DAY PROG COPY HOLD LIGHT | MON…SUN | PROG 0 (00:00) + 6 kikapcsolható | 5–40 °C | 3 mp |
| Q7 – „új szoftverrel” | ugyanaz | 1–7 | P0 (00:00) + P1–P6 kikapcsolható | 5–35 °C | 3 mp |
| Q7 – régi | HOLD DAY LIGHT RESET COPY PROG SET | 1–7 | **pontosan 6**: P1–P6, mindig aktív | 7–35 °C | 5 mp |
| Q7 RF – rádiós (régi) | HOLD DAY LIGHT TEST COPY PROG SET | 1–7 | mint a régi Q7 | 7–35 °C | 5 mp |

### Régi Q7 és Q7 RF (fix 6 kapcsolás)

- Gyári program minden napra: P1 7:00 20 °C, P2 9:00 17 °C, P3 12:30 20 °C, P4 15:00 19 °C, P5 17:30 22 °C, P6 23:00 17 °C.
- A P6 hőfoka másnap P1-ig érvényes, nincs külön éjféli kapcsolás.
- Programozás: `SET` → `SET` nyomva + `PROG` → `+/−` nap (vagy mind a 7) → `PROG` → P1 időpont → `PROG` → P1 hőfok →
  `PROG` → … → P6 hőfok → `SET`. (A P6 utáni `PROG` újra a P1-re ugrik, ellenőrzéshez.)
- Másolás: `COPY` ~5 mp → `+/−` forrásnap → `COPY` → `+/−` célnap → `COPY` … → `SET`. 10 mp után magától nyugtáz.
- Party: `+/−`, majd `DAY` annyiszor, ahány óra (1–9). Szabadság és tartós hőfok: mint az újabbnál.
- Nincs fűtés/hűtés váltás, kalibrálás, gombzár (a hűtést a bekötés dönti el).
- **Q7 RF**: `TEST` ~2 mp → 2 percig 5 mp-enként ki-be kapcsoló jel, a vevő piros LED-je követi (hatótáv-teszt).
  Párosítás: vevőn `M/A` ~10 mp (zöld LED villog), majd a termosztáton `SET` + `DAY` együtt ~10 mp. Csak ha nem működik
  a kapcsolat, mert új biztonsági kódot generál.

**Hogyan lesz 6 kapcsolás** [F]: ha az előző nap ugyanazzal a hőfokkal ér véget, amivel a nap kezdődik, az éjféli pontot
az app elhagyja (a P6 átnyúlik). A maradék helyeket „töltelék” kapcsolások egészítik ki (+10 percenként ugyanazzal a
hőfokkal), így a hőfoklefutás nem változik. Az időpontokat növekvő sorrendben adja meg, mert a füzet erről nem szól.
