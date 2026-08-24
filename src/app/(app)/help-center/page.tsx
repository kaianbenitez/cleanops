import { eq } from "drizzle-orm";
import { CheckCircle2, Clock3, Phone, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const RELEASES = [
  {
    version: "v0.2.89",
    date: "August 24, 2026",
    title: "Payroll page is easier to use with a keyboard or screen reader",
    changes: [
      "Editable hours, mileage, and bonus fields on the Payroll page now reliably show the saved value after you make a change, instead of sometimes showing what you typed before it was saved.",
      "The employee row and 'Details' toggles now announce whether they're open or closed to screen readers, and the keyboard focus outline on editable fields is visible again.",
      "The disabled 'Export blocked' control is now a real button people can tab to, and both payroll tables have hidden labels screen readers can announce.",
      "The payroll table needs less scrolling on common laptop screens, and the small badge/label text is a bit larger and easier to read.",
    ],
  },
  {
    version: "v0.2.88",
    date: "August 23, 2026",
    title: "The Shimmer landing page is clearer about the beta",
    changes: [
      "The landing page now explains the main day-to-day outcomes, beta pricing, and one-business-day reply time near the first action.",
      "The early-access form is shorter, with only the details needed to start the conversation.",
      "Mobile visitors can now reach the product section quickly, and the page labels illustrative beta screens more clearly.",
    ],
  },
  {
    version: "v0.2.87",
    date: "August 23, 2026",
    title: "Calendar controls stay calmer on dense schedules",
    changes: [
      "Day metrics now stay tucked into one expandable summary until an ultra-wide screen has room for them.",
      "The Board visual legend is now available on demand, leaving more space for the schedule itself.",
    ],
  },
  {
    version: "v0.2.86",
    date: "August 23, 2026",
    title: "Calendar attention and route details are easier to act on",
    changes: [
      "Month attention counts now explain affected jobs and route to the earliest affected day for faster follow-up.",
      "Calendar filters now stay usable in small windows, capacity labels name labor hours clearly, and route previews include an accessible ordered stop list.",
    ],
  },
  {
    version: "v0.2.85",
    date: "August 23, 2026",
    title: "Calendar attention and PTO capacity now stay in sync",
    changes: [
      "Calendar Board, List, Week, and Month now use the same PTO-aware capacity and readiness rules.",
      "Needs attention now includes the same overlapping jobs shown in the Board attention rail and respects the active date and filters.",
    ],
  },
  {
    version: "v0.2.84",
    date: "August 23, 2026",
    title: "Calendar filters now match Month readiness totals",
    changes: [
      "Fixed Month view so readiness counts follow the active assignment filter instead of including hidden jobs.",
    ],
  },
  {
    version: "v0.2.83",
    date: "August 23, 2026",
    title: "Month view now shows readiness correctly",
    changes: [
      "Fixed Month view readiness summaries so Needs crew, Needs time, Ready, Conflict, and Over capacity counts now match the other Calendar views.",
    ],
  },
  {
    version: "v0.2.82",
    date: "August 23, 2026",
    title: "Calendar shows one readiness state everywhere",
    changes: [
      "Board, Daily list, Week, and Month now use the same primary readiness labels: Needs crew, Needs time, Ready, Conflict, and Over capacity.",
      "Detailed attention groups and scheduling warnings remain available underneath, so dispatchers can still see exactly what needs fixing.",
    ],
  },
  {
    version: "v0.2.81",
    date: "August 23, 2026",
    title: "Calendar gets its final polish pass",
    changes: [
      "Calendar’s mobile and desktop views now use the same crew terminology and assignment states, so ‘Crew not assigned’ means the same thing everywhere.",
      "Appointment and meeting controls now use the same icon style and clearer touch-sized actions across the calendar.",
      "The combined Calendar harden, adapt, optimize, clarify, and polish sweep keeps the existing scheduling behavior while making status, loading, and recovery details easier to read.",
    ],
  },
  {
    version: "v0.2.80",
    date: "August 23, 2026",
    title: "Calendar is easier to filter and scan",
    changes: [
      "Active Calendar filters are now visible, removable, and paired with clear field labels so dispatchers can see why the board is narrowed.",
      "The daily list uses tighter spacing and clearer primary-versus-secondary text so appointments, customers, times, and notes are easier to scan.",
      "Job details, loading feedback, and route previews now handle narrow screens and accessibility states more reliably.",
    ],
  },
  {
    version: "v0.2.79",
    date: "August 23, 2026",
    title: "Calendar actions use clearer language",
    changes: [
      "Calendar now uses plain labels such as Crew not assigned, Time not set, Overlapping jobs, and Move this visit so the next action is easier to understand.",
      "Job, appointment, duration, and connection messages now explain what failed and what to try next.",
    ],
  },
  {
    version: "v0.2.78",
    date: "August 23, 2026",
    title: "Calendar dispatch stays responsive as schedules grow",
    changes: [
      "The dispatch board now indexes jobs and internal appointments by employee once, reducing repeated scans while rendering crew lanes and conflict states.",
      "The optimization preserves the existing board behavior across vertical and horizontal views.",
    ],
  },
  {
    version: "v0.2.77",
    date: "August 23, 2026",
    title: "Calendar events handle slow or failed connections better",
    changes: [
      "Internal events now show loading feedback, recoverable errors, and a Try again action when the network is unavailable.",
      "Saving an event prevents duplicate submissions, trims the title, and limits it to 120 characters so long titles do not break the calendar strip.",
    ],
  },
  {
    version: "v0.2.76",
    date: "August 23, 2026",
    title: "Calendar text is easier to scan",
    changes: [
      "Calendar headings, dates, summaries, labels, and table headers now use a consistent type scale, so primary information stands out from supporting details.",
      "Numbers and operational metadata now use steadier sizing and tabular alignment across the dispatch, week, month, and list views.",
    ],
  },
  {
    version: "v0.2.75",
    date: "August 23, 2026",
    title: "A calmer Calendar layout at every width",
    changes: [
      "Calendar navigation now keeps its date controls, views, filters, and utility actions in clearer responsive groups instead of competing for one crowded row.",
      "The dispatch board, attention rail, and mobile spacing now share a more consistent vertical rhythm for faster scanning.",
    ],
  },
  {
    version: "v0.2.74",
    date: "August 21, 2026",
    title: "Proposal approvals now keep scheduling separate",
    changes: [
      "Customers can optionally share a preferred cleaning date, clearly marked as a request until the office confirms availability.",
      "Proposal approval now says Approve proposal and never creates or reserves a cleaning appointment by itself.",
      "Office staff can see the requested date, the approved-but-not-scheduled state, and the approval event from the quote list and detail page.",
    ],
  },
  {
    version: "v0.2.73",
    date: "August 21, 2026",
    title: "Fixed layout on the job screen and near the top of the phone",
    changes: [
      "Fixed the Save/Complete button on a job screen so it no longer sits on top of the bottom menu bar.",
      "Fixed content near the top of the screen so it no longer sits under your phone's signal and battery icons.",
    ],
  },
  {
    version: "v0.2.72",
    date: "August 20, 2026",
    title: "Team jobs and weekly hours are more accurate",
    changes: [
      "Fixed a rare case on team jobs where the office finishing one teammate's entry could mark the whole job done before every teammate had even started recording time — Shimmer now waits until everyone on the job has saved their time.",
      "Fixed your weekly hours total so time recorded right around midnight lands in the correct week.",
    ],
  },
  {
    version: "v0.2.71",
    date: "August 20, 2026",
    title: "Search is faster with Cmd/Ctrl+K",
    changes: [
      "Press Cmd+K on Mac or Ctrl+K on Windows and Linux to jump straight into Shimmer search.",
      "The search bar now shows the shortcut for your device so it is easy to discover.",
    ],
  },
  {
    version: "v0.2.70",
    date: "August 20, 2026",
    title: "Employee sign-in now stays put on personal phones",
    changes: [
      "Shimmer now locks its long-lived, automatically refreshed sign-in cookie across browser, server, and route protection so closing the app does not end a session.",
      "The login and iPhone install guidance now explains that employees stay signed in until they choose Sign out and should reopen Shimmer from the same Home Screen icon each day.",
    ],
  },
  {
    version: "v0.2.69",
    date: "August 20, 2026",
    title: "My Day makes clocked-in travel and saved time clear",
    changes: [
      "The travel action now says Start travel & clock in, and the running timer confirms that travel is included in the cleaner's recorded time.",
      "After a cleaner finishes a house, My Day now moves the next pending stop to the main action area instead of leaving the completed house at the top.",
      "Completion messages now explicitly confirm that the cleaner's time was saved, and the login form can be recognized by the device's password manager for easier sign-in.",
    ],
  },
  {
    version: "v0.2.68",
    date: "August 20, 2026",
    title: "Quote availability now includes the full field team",
    changes: [
      "Fixed Check availability on quotes so active employees assigned to the selected service area are included alongside field-enabled admins.",
    ],
  },
  {
    version: "v0.2.67",
    date: "August 20, 2026",
    title: "Calendar Board: drag a job onto a crew, or drag it back off",
    changes: [
      "Jobs in the \"No crew yet\" list can now be dragged straight onto a crew's lane, not just clicked. It checks the exact same rules as clicking — a crew that's fully booked or on leave still refuses the drop, and a tight-but-possible fit still shows the same warning before you let go.",
      "Dragging an untimed job onto a lane sets its arrival time to wherever you drop it, snapped to the nearest 15 minutes — the same as setting the time by clicking.",
      "You can now drag a job off a crew's lane and drop it onto the \"Needs attention\" list to unassign it — the list lights up with a clear \"Drop to remove the crew\" cue while you're dragging over it. Undo brings the crew and time right back.",
      "Dragging a multi-cleaner job from one crew's lane onto another still swaps out only the crew member whose lane you dragged it from, keeping the rest of the crew in place — that's staying as-is by design.",
    ],
  },
  {
    version: "v0.2.66",
    date: "August 20, 2026",
    title: "Calendar toolbar: four views, a layout switch, and feedback while dates load",
    changes: [
      "The view buttons are now Board, Day, Week and Month. The old \"Vertical\" and \"Horizontal\" buttons are gone — those were the same board drawn two ways, so they became a small layout switch that appears beside the view buttons only while you're on Board.",
      "Switching to Day, Week or Month and back to Board now keeps whichever layout you were using, and switching layout no longer moves you off the date you were looking at.",
      "Your old saved calendar links still work and land on the right view and layout.",
      "The \"Needs attention\" button in the toolbar now jumps you straight to that list beside the board, instead of opening a panel that no longer exists.",
      "Moving between dates with the arrows, the date picker, or \"Today\" now shows a brief \"Updating…\" note, so it's clear the calendar is fetching rather than ignoring the click.",
      "Opening the calendar fresh now shows the board's shape while it loads instead of a blank screen.",
    ],
  },
  {
    version: "v0.2.65",
    date: "August 19, 2026",
    title: "Calendar Board rework: one board, an always-on attention list, and click-to-place",
    changes: [
      "The staff calendar's column and row layouts are now one Board, so switching between crews-as-columns and crews-as-rows keeps the same features instead of two boards drifting apart.",
      "A new \"Needs attention\" list sits beside the board at all times (it used to hide below a certain screen width): no crew yet, no arrival time, assigned over a leave day, and double-booked, each in its own group.",
      "You can now click a job in that list (or in the new \"No arrival time\" tray above the board) and then click a crew's lane to place it — no drag required. Every lane shows whether that spot is open, a conflict, or blocked by leave before you commit, with the exact reason (\"Overlaps 1:30 PM Pham,\" \"On leave,\" \"Over 8h day\").",
      "Each crew's header now shows a capacity meter (hours booked out of hours available) and a \"Half day\" chip when they're on partial leave, using the company's configured workday hours.",
      "Placing a job now flies it into position with a short landing animation, and switching layouts animates the crews into place — both skip automatically if your system has reduced motion turned on.",
      "Lane placement is fully keyboard-operable: Tab to a crew's lane, arrow keys to nudge an untimed job's time in 15-minute steps, Enter to place it, Escape to cancel.",
    ],
  },
  {
    version: "v0.2.64",
    date: "August 19, 2026",
    title: "Calendar foundation work for the upcoming Board view",
    changes: [
      "The Needs-attention count in the calendar toolbar now shows up on every view — Day, Week, and Month, not just the staff boards.",
      "The scheduling now-line reads the company's own time zone instead of your browser's clock, so it lines up correctly wherever you're viewing from.",
      "Clicking a day on the Month view now returns you to the crew layout (columns or rows) you were last using, instead of always opening the column layout.",
      "Added a new Working hours setting (Settings → Calendar) so the board's start and end times can be configured per company, ahead of a bigger calendar redesign landing soon.",
    ],
  },
  {
    version: "v0.2.63",
    date: "August 19, 2026",
    title: "Job schedule edits now save together",
    changes: [
      "Date, time, crew, and status changes now stay in a draft until you choose Save changes, so a multi-field edit is reviewed and validated as one update.",
      "Discard changes is available before saving, and closing a job with unsaved edits asks for confirmation. Quick list edits and drag-and-drop scheduling remain immediate with their existing feedback and Undo behavior.",
    ],
  },
  {
    version: "v0.2.62",
    date: "August 19, 2026",
    title: "Cleaner service areas now have one clear setting",
    changes: [
      "Employee profiles now use one “Works in” checkbox list for service areas. That same list is what guided booking uses when checking which cleaners are available.",
      "The old primary-area dropdown was removed, so a cleaner cannot appear assigned to an area while being excluded from availability checks.",
    ],
  },
  {
    version: "v0.2.61",
    date: "August 19, 2026",
    title: "Dispatch replaces the hourly grid",
    changes: [
      "The default Calendar screen (Dispatch) no longer shows a tall hourly grid. Jobs are grouped into Morning and Afternoon, and within each into the crews working together, with full names, job counts, and an estimated finish time.",
      "A new Needs attention section lists every job missing a crew, missing an arrival time, or with a time-off conflict, each with one clear action — Assign crew, Schedule, or Review conflict. Cancelled and no-show jobs are tucked into a collapsed list below it.",
      "An empty Morning or Afternoon now says so plainly and offers Schedule job, instead of just \"no jobs.\"",
      "The older detailed timeline is still available under More views → Vertical timeline.",
      "Fixed: switching from Capacity or Month back to Dispatch, Day list, or Vertical timeline could silently jump to a different day than the one you were looking at — it now stays on the same day.",
    ],
  },
  {
    version: "v0.2.60",
    date: "August 19, 2026",
    title: "A safe way to schedule without dragging",
    changes: [
      "Every job card and Job Detail now has a Move or assign button that opens a guided panel: pick the date, morning or afternoon arrival, and the crew, then review a plain-language summary before confirming.",
      "Dragging a job onto a different cleaner no longer reassigns it right away — it opens the same panel with that cleaner already selected, and asks whether to move the job to them or add them to the existing crew, so nothing changes until you confirm.",
      "Dragging within a cleaner's own column still works exactly as before, for a quick time change.",
    ],
  },
  {
    version: "v0.2.59",
    date: "August 19, 2026",
    title: "Calendar navigation is easier to scan",
    changes: [
      "The calendar views are now named for what a scheduler actually does: Dispatch, Capacity, and Month, with Day list and Vertical timeline tucked under a More views menu.",
      "The top of the Calendar page is now a single, compact toolbar — date navigation, views, and Schedule job — instead of a wide row that scrolled sideways.",
      "Projected revenue and discounts no longer show on the Calendar header; a single Needs attention count and one Filters button (with all filter fields inside it) replaced the old scattered filter controls.",
    ],
  },
  {
    version: "v0.2.58",
    date: "August 18, 2026",
    title: "Key pages are cleaner and more direct",
    changes: [
      "Quote, customer, invoice, and supplies pages now use shorter headings and remove guide text that repeated what the controls already showed.",
      "The add-customer page no longer includes the beta workflow guide, and optional home details stay collapsed until they are needed.",
      "Customer proposals now show compact service and extras choices, with the longer booking terms available only when opened.",
    ],
  },
  {
    version: "v0.2.57",
    date: "August 18, 2026",
    title: "Quotes can now be booked with a real schedule",
    changes: [
      "When a customer accepts a quote, it now appears in “Accepted — needs scheduling” until someone confirms the date, morning or afternoon arrival window, and cleaners.",
      "The new guided booking panel offers three clear choices that account for branch coverage, time off, existing jobs, internal meetings, travel/food time, and the 5:00 PM finish time. You can still choose a date and crew manually when needed.",
      "A quote is now marked booked only after the complete schedule is confirmed. One-time jobs receive their crew assignments immediately, and recurring visits keep the selected branch, crew, arrival window, and estimate.",
    ],
  },
  {
    version: "v0.2.56",
    date: "August 18, 2026",
    title: "My Day now shows each customer's actual service schedule",
    changes: [
      "Instead of the generic “Recurring” label, a cleaner now sees the customer's actual schedule — Weekly, Bi-weekly, Every 4 weeks, or Monthly — on My Day.",
    ],
  },
  {
    version: "v0.2.55",
    date: "August 17, 2026",
    title: "The scheduling calendar now shows how many hours are free",
    changes: [
      "When you're picking a start date to convert a quote into work, each day on the calendar now shows how many crew hours are still free that day, colored green (comfortable), amber (tight), or red (already over-booked) — never just a color, always with the number too.",
      "The calendar also shows how many hours the job you're scheduling needs, so you can compare at a glance instead of doing the math yourself.",
      "This never blocks a day — you can still schedule anything, anytime. It's a heads-up, not a rule.",
      "It uses time off and a new Settings → Calendar → \"Hours per cleaner\" number (defaults to 8) to figure out what's free. If that setting or the calendar's data can't load, the date picker still works normally, just without the colors.",
    ],
  },
  {
    version: "v0.2.54",
    date: "August 17, 2026",
    title: "Pets now track hair rating, dog/cat counts, and names",
    changes: [
      "The Pets field from last update is now more specific: a pet hair rating (1-5, how much shedding to expect), how many dogs and cats, and their names — all optional.",
      "There's still a free-text \"Other pet notes\" box underneath for anything that doesn't fit those fields, like \"do not give her treats.\"",
      "The customer profile page has the same fields now, and the Pets card there shows a quick summary (e.g. \"Pet hair rating: 4/5 · 2 dogs (Rex, Fido)\") instead of just a paragraph of text.",
    ],
  },
  {
    version: "v0.2.53",
    date: "August 17, 2026",
    title: "Pets now show up when you're building a proposal",
    changes: [
      "The \"Home condition and travel\" section of a new proposal now has a Pets field, so you don't have to leave the proposal and open the customer's profile to note a dog or cat.",
      "For an existing customer, any pet notes already on file show up automatically. Add or edit them there and they're saved back to the customer's profile as soon as the proposal is created — the crew sees the same note on the job.",
      "For a brand-new customer, whatever you type in Pets is saved onto their new profile right away.",
    ],
  },
  {
    version: "v0.2.52",
    date: "August 17, 2026",
    title: "Room names no longer get cut off in the quote builder",
    changes: [
      "Room names like \"Kitchen Large\" and \"Kitchen Medium\" used to get chopped down to \"Kitchen ...\" on a proposal, making it impossible to tell which room's count you were changing. Room names now wrap to a second line instead of cutting off.",
      "The proposal form is also wider now, and the price panel a bit narrower, so there's more room for names before wrapping even kicks in.",
    ],
  },
  {
    version: "v0.2.51",
    date: "August 17, 2026",
    title: "Date fields you can click instead of type",
    changes: [
      "Quote dates (\"Valid until\" and the \"Start date\" when converting a quote into work) now open a real calendar you click, instead of a plain box where you had to type the date yourself.",
      "The same click-to-pick calendar was added to scheduling a new job, setting up a recurring series, adding a new employee's hired date, and requesting time off.",
      "Time-off requests still won't let you pick an end date before the start date — the calendar just greys those days out instead of letting you tap them and then rejecting it.",
    ],
  },
  {
    version: "v0.2.50",
    date: "August 17, 2026",
    title: "Archived employees no longer clutter the team directory",
    changes: [
      "The Employees page now shows active staff by default instead of mixing in everyone who's ever been archived.",
      "An \"Archived\" filter chip shows exactly the archived staff — their profiles, payroll history, and job history are still there, just a click away instead of front and center.",
      "The \"Active cleaners\" count on the Employees page now counts only active staff, so it no longer looks like people are missing.",
    ],
  },
  {
    version: "v0.2.49",
    date: "August 16, 2026",
    title: "Homepage visuals cleaned up",
    changes: [
      "The homepage now leads with a shared-calendar preview instead of a mostly-empty chart; the weekly revenue chart moved down next to the billing section, where it fits better.",
      "The \"crew app for the workday\" preview now shows inside a real phone frame instead of a squeezed, hard-to-read sliver of the screen.",
    ],
  },
  {
    version: "v0.2.48",
    date: "August 16, 2026",
    title: "My Day redesigned around your next stop",
    changes: [
      "Your next job now owns the top of the screen — big time, customer name, and a tappable address that opens Directions directly, no separate button.",
      "While you're clocked in, a running timer bar shows how long you've been on the current house.",
      "Today's mop heads, rags, and vacuums are now totaled once at the top of the day instead of repeated on every job.",
      "The rest of today and the rest of the week now read as a single route with a line connecting your stops, instead of a stack of separate cards.",
      "A missing address now shows up in amber with a way to call the office, instead of blending in as regular grey text.",
      "Pet notes and do-not-clean notes now show as small tags on the job when a customer has them set.",
    ],
  },
  {
    version: "v0.2.47",
    date: "August 16, 2026",
    title: "Shimmer can now be installed to your home screen",
    changes: [
      "On an iPhone or iPad, open Shimmer in Safari, tap Share, then Add to Home Screen — it launches full-screen with no browser bar and its own icon, just like a regular app.",
      "If you haven't installed it yet, a one-time banner at the top now walks you through the steps. Dismiss it and it won't come back.",
    ],
  },
  {
    version: "v0.2.46",
    date: "August 13, 2026",
    title: "Double-booking warnings now show up when you edit a job",
    changes: [
      "Changing a job's date, time, duration, or crew from the Calendar or the Job Detail page now warns you right there if it puts an employee on two jobs at once — the check was already running, it just wasn't shown before.",
    ],
  },
  {
    version: "v0.2.45",
    date: "August 12, 2026",
    title: "Settings reorganized into a sidebar with clear sections",
    changes: [
      "Settings is no longer one long page — it's now grouped into Company, Pricing & Quoting, Payroll, Calendar, Integrations, and Team & Access, with a menu down the side so you can jump straight to what you need.",
      "Company profile, monthly revenue goal, mileage rate, and holidays/working days each now have their own clear spot instead of being mixed in with everything else.",
      "The GoHighLevel connection status (API key, location, webhook) is now shown right on the GoHighLevel settings page.",
      "Administrator management — password resets and marking someone as also a field cleaner — moved from Settings to the Employees page, next to the rest of your team.",
    ],
  },
  {
    version: "v0.2.44",
    date: "August 11, 2026",
    title: "Quotes now show on the customer profile, and recurring setup pulls the price from the last quote",
    changes: [
      "A customer's quote history is now visible right on their profile page, not just when you're editing it.",
      "When you set up a new recurring service for a customer, the price per visit is now automatically filled in from their most recent quote — you can still change it or pick a different service price before saving.",
    ],
  },
  {
    version: "v0.2.43",
    date: "August 11, 2026",
    title: "Cleaners can now see their own customer feedback",
    changes: [
      "Added a \"My scores\" page to the employee menu where cleaners can see how their own completed jobs were rated — average star rating, response rate, 5-star count, and each customer's rating and comment, filterable by date range.",
    ],
  },
  {
    version: "v0.2.42",
    date: "August 11, 2026",
    title: "Add skill tags to employee profiles",
    changes: [
      "Every employee profile now has a \"Skills & specialties\" section where you can tag what someone's especially good at — Organizer, Deep clean expert, Move-out specialist, and more, or type your own. Tags save instantly and show up right next to the person's name at the top of their profile too.",
    ],
  },
  {
    version: "v0.2.41",
    date: "August 11, 2026",
    title: "Fixed rescheduling a job from the Calendar not saving",
    changes: [
      "When you opened a scheduled job from the Calendar and picked a new date or time in the pop-up picker, the change could silently fail to save — there was no save button and no confirmation either way. Picking a date or time now saves immediately, the same way changing the crew or status already did.",
    ],
  },
  {
    version: "v0.2.40",
    date: "August 11, 2026",
    title: "Fixed an inaccurate date picker and gave date/time pickers a cleaner look",
    changes: [
      "Fixed a bug where the appointment date picker could save the wrong day, one off from what you clicked, depending on your computer's time zone.",
      "The date and time picker pop-ups now match the rest of the app's styling, and the time picker shows a clearer 12-hour AM/PM format.",
    ],
  },
  {
    version: "v0.2.39",
    date: "August 10, 2026",
    title: "Add internal appointments to the Calendar",
    changes: [
      "A new \"+ New appointment\" button on the Calendar opens a slide-in panel for scheduling internal staff meetings — separate from client cleaning jobs, with a title, date, time, duration, and a list of attendees drawn from your whole team (not just field cleaners).",
      "Every attendee is automatically paid for the meeting's length (defaults to one hour) — it's folded into their normal payroll hours the next time payroll is generated, no manual adjustment needed.",
      "Appointments show up alongside jobs across the Staff, Staff Vertical, Week, Month, and List calendar views, and can be edited or cancelled from the same panel.",
    ],
  },
  {
    version: "v0.2.38",
    date: "August 10, 2026",
    title: "Employees can request time off from My Day",
    changes: [
      "Employees can send a time-off request with dates, half-day periods, and an optional note from My Day.",
      "Admins can approve or deny requests on the employee profile; approved requests automatically appear in the employee schedule and payroll PTO logic.",
    ],
  },
  {
    version: "v0.2.37",
    date: "August 10, 2026",
    title: "Multi-cleaner jobs now show who you're waiting on",
    changes: [
      "On a job with more than one cleaner assigned, finishing your part used to show a plain 'Job completed' screen even if a teammate was still on-site — which made it look like the job was done when it wasn't.",
      "That screen now says 'Your part is done — waiting on [name]' until every assigned cleaner has clocked out, then the job itself shows as completed.",
    ],
  },
  {
    version: "v0.2.36",
    date: "August 10, 2026",
    title: "My Day now shows what's scheduled after today",
    changes: [
      "A new 'Upcoming jobs' section on My Day shows your next few scheduled stops beyond today, so you can glance ahead without leaving the app.",
      "The all-day rotation reminder no longer shows twice for your current job — it now appears once, on that job's own card.",
    ],
  },
  {
    version: "v0.2.35",
    date: "August 10, 2026",
    title: "My Day: easier to read, easier to tap, easier to trust",
    changes: [
      "Buttons now visibly gray out while an action is saving, so it's clear your tap registered instead of looking frozen.",
      "Light gray text (timestamps, addresses) is now easier to read.",
      "The mileage edit link and other small taps are bigger, so they're easier to hit one-handed or on the move.",
      "The 'On my way' / 'Arrived' / 'Start' button now sits at the top of your next job's card, instead of below all the job details.",
      "The undo notification no longer sits under the home-swipe bar on iPhones.",
    ],
  },
  {
    version: "v0.2.34",
    date: "August 10, 2026",
    title: "Rotational task reminder now starts collapsed on My Day",
    changes: [
      "The all-day rotation reminder used to show fully expanded every time you opened My Day. It now starts collapsed — tap it to see the week's details.",
    ],
  },
  {
    version: "v0.2.33",
    date: "August 10, 2026",
    title: "Fixed the crew-app phone mockup alignment",
    changes: [
      "The phone mockup's notch no longer covers the Shimmer logo, and the small supporting screenshot beside it no longer overlaps or hides buttons on the main screen.",
    ],
  },
  {
    version: "v0.2.32",
    date: "August 10, 2026",
    title: "The crew app now shown on a phone mockup",
    changes: [
      "The 'Built for the field' screenshot now sits inside a realistic phone mockup instead of a plain bordered box.",
    ],
  },
  {
    version: "v0.2.31",
    date: "August 10, 2026",
    title: "Fresh crew-app screenshots on the Shimmer page",
    changes: [
      "The crew-app screenshots on the homepage now show the current My Day screen, including the tidier mileage entry.",
      "The 'Built for the field' section now shows a job details screen instead of repeating the same jobs list twice.",
    ],
  },
  {
    version: "v0.2.30",
    date: "August 10, 2026",
    title: "A tidier mileage entry on My Day",
    changes: [
      "Drivers no longer see an open mileage box on every job by default. Tap 'Log mileage' (or the logged total) to enter or update it, then it tucks back away after saving.",
    ],
  },
  {
    version: "v0.2.29",
    date: "August 10, 2026",
    title: "A stronger opening image for the Shimmer page",
    changes: [
      "The homepage now leads with the dashboard screenshot instead of the calendar, and the calendar moved down to the 'one operating rhythm' section with its own caption.",
      "Removed a leftover caption line under the homepage's main screenshot.",
    ],
  },
  {
    version: "v0.2.28",
    date: "August 10, 2026",
    title: "Landing page copy, colors, and content refresh",
    changes: [
      "The 'Join the beta' section is easier on the eyes now — no more full-screen bright blue.",
      "'More than the basics' now points to notifications and fully customizable settings (pricing, quote presentation, add-ons, service catalog, payroll tiers) instead of two cards that weren't ready yet.",
      "The crew app description and the 'Built for the field' section now mention the feedback-and-tip link, payment tagging, and schedule visibility cleaners already have.",
      "The crew app screenshot in the feature list is properly sized now instead of floating oddly.",
      "The homepage headline, subhead, and page title were rewritten for search and clarity.",
    ],
  },
  {
    version: "v0.2.27",
    date: "August 10, 2026",
    title: "A shorter, tighter Shimmer landing page",
    changes: [
      "The feature list is now a click-through set of tabs instead of one long scrolling list, so the page reads in far less scrolling.",
      "The 'More than the basics' section now highlights instant global search and time-off/PTO tracking in place of supplies and recurring service plans, which aren't ready to show yet.",
    ],
  },
  {
    version: "v0.2.26",
    date: "August 10, 2026",
    title: "A livelier Shimmer landing page",
    changes: [
      "The public Shimmer page now has a dedicated 'Built for the field' showcase for the My Day crew app, with a phone-in-hand view of a real workday.",
      "A new 'More than the basics' section highlights quality and feedback reports, reporting and CSV export, GoHighLevel automation, recurring service plans, supplies, and the team directory.",
      "Scrolling through the page now feels smoother and more polished, with motion that eases in as you scroll and turns off automatically if you've asked your device to reduce motion.",
    ],
  },
  {
    version: "v0.2.25",
    date: "August 9, 2026",
    title: "Rotational task reminders for recurring clients",
    changes: [
      "Calendar and My Day now show the current Week 1–4 rotation plus the complete reference checklist for recurring-client visits, including the every-time couch-cushion task.",
    ],
  },
  {
    version: "v0.2.24",
    date: "August 8, 2026",
    title: "Supplies temporarily tucked away",
    changes: [
      "Supplies is temporarily hidden from the main navigation while the rest of the workspace remains available.",
    ],
  },
  {
    version: "v0.2.23",
    date: "August 8, 2026",
    title: "A collapsible desktop navigation",
    changes: [
      "Minimize the desktop navigation to an icon-only rail when you need more working space, then expand it again from the sidebar.",
    ],
  },
  {
    version: "v0.2.22",
    date: "August 8, 2026",
    title: "Internally approved quotes now close the loop",
    changes: [
      "Scheduling a quote after approval received outside the customer proposal now marks it Accepted, while preserving the staff note that no customer signature was collected.",
    ],
  },
  {
    version: "v0.2.21",
    date: "August 7, 2026",
    title: "A compact Calendar control panel",
    changes: [
      "Calendar navigation, view tabs, summaries, and filters now live in one clearer dispatch control panel.",
      "Daily job count and projected revenue now use labeled summary metrics, with icons for filter and unassigned-work actions.",
    ],
  },
  {
    version: "v0.2.20",
    date: "August 7, 2026",
    title: "Simpler Calendar dispatch controls",
    changes: [
      "Calendar view buttons now use the shorter Vertical and Horizontal labels.",
      "The staff-board assignment strip was removed; the calendar toolbar now includes daily projected revenue and an Unassigned jobs button.",
    ],
  },
  {
    version: "v0.2.19",
    date: "August 7, 2026",
    title: "Visible Calendar views and right-aligned filters",
    changes: [
      "Calendar now shows Week, Month, Day, Employee vertical, and Employee horizontal as visible view buttons.",
      "Calendar job counts and filters now align to the right side of their row.",
    ],
  },
  {
    version: "v0.2.18",
    date: "August 7, 2026",
    title: "A full-width Calendar dispatch board",
    changes: [
      "The calendar view selector now sits at the far right of the date-navigation row.",
      "Unassigned work no longer reserves a permanent right column; use the Unassigned jobs button to open it only when needed.",
    ],
  },
  {
    version: "v0.2.17",
    date: "August 7, 2026",
    title: "A single-row Calendar toolbar",
    changes: [
      "The date picker, calendar view selector, and date navigation now stay together on one scrollable row instead of stacking.",
      "The Staff board starts directly with dispatch controls, without the redundant Staff Daily heading and sort action.",
    ],
  },
  {
    version: "v0.2.16",
    date: "August 7, 2026",
    title: "A full unassigned queue in Calendar",
    changes: [
      "Calendar now lets dispatchers expand the unassigned queue into the page, so every waiting job remains reachable without a cramped nested scroll area.",
    ],
  },
  {
    version: "v0.2.15",
    date: "August 7, 2026",
    title: "Start recurring service from a customer profile",
    changes: [
      "Customer profiles now include a Set up recurring service action that opens the schedule with the customer already selected.",
    ],
  },
  {
    version: "v0.2.14",
    date: "August 7, 2026",
    title: "Calendar controls that fit every screen",
    changes: [
      "The Calendar date picker now stays fully visible on smaller screens.",
      "Calendar, dashboard, report, and form date controls now share clearer calendar styling and more comfortable touch targets.",
    ],
  },
  {
    version: "v0.2.13",
    date: "August 7, 2026",
    title: "Clearer product examples on the Shimmer page",
    changes: [
      "Feature screenshots are now much bigger and easier to read, and each feature has its own icon.",
      "The crew app now uses the real device photo provided by the founder.",
      "Customer-record and quote examples now show real customer and public proposal pages instead of internal lists.",
      "The beta sign-up section now says what it needs to say once, without repeating itself.",
    ],
  },
  {
    version: "v0.2.12",
    date: "August 7, 2026",
    title: "A clearer beta sign-up page",
    changes: [
      "The Shimmer feature list is now easier to scan without side-scrolling.",
      "The FAQ now answers more of the practical questions people ask before switching.",
      "Every sign-up button now clearly says Shimmer is in beta and free to join, rather than implying a paid product.",
    ],
  },
  {
    version: "v0.2.11",
    date: "August 7, 2026",
    title: "A clearer, more complete Shimmer landing page",
    changes: [
      "The public Shimmer page now focuses on the product itself, with the previous comparison table removed.",
      "Product examples are easier to read, and the crew app is now shown in a real phone frame.",
      "The page has more visual variety from section to section, and its examples now show a fuller cleaning business with more customers, paid invoices, and team members.",
    ],
  },
  {
    version: "v0.2.10",
    date: "August 7, 2026",
    title: "A more complete Shimmer landing page",
    changes: [
      "The Shimmer page now shows how it compares with pen and paper, spreadsheets, calendars, and generic scheduling software.",
      "You can browse the full lineup of scheduling, field work, customer, quote, invoicing, and payroll features in one place.",
      "The page now explains the real cleaning-business experience behind Shimmer and answers common early-access questions.",
    ],
  },
  {
    version: "v0.2.9",
    date: "August 7, 2026",
    title: "A clearer Shimmer early-access page",
    changes: [
      "The public Shimmer page now shows real examples of scheduling, field work, customer records, quotes, invoicing, payroll-related team tracking, and the dashboard.",
      "Early-access requests now only require a business name and email address.",
    ],
  },
  {
    version: "v0.2.8",
    date: "August 7, 2026",
    title: "Faster manual time entry",
    changes: [
      "When logging a technician's time by hand on a job, you can now enter total hours worked instead of separate start and end times.",
      "Manual time entry no longer asks you to pick a date -- it always uses the job's own scheduled date.",
    ],
  },
  {
    version: "v0.2.6",
    date: "August 7, 2026",
    title: "Per-visit price and Job Ticket Hours adjustments",
    changes: [
      "Administrators can now adjust the price charged or Job Ticket Hours for one job occurrence without changing its recurring schedule.",
      "Manually set Job Ticket Hours now stay in place when payroll is refreshed.",
    ],
  },
  {
    version: "v0.2.7",
    date: "August 7, 2026",
    title: "Customer added dates",
    changes: [
      "You can now see when each customer was added, on their customer list card and on their profile page.",
    ],
  },
  {
    version: "v0.2.5",
    date: "August 7, 2026",
    title: "Sales reports and smoother previews",
    changes: [
      "Sales report added to Reports & Exports, with leads, quote progress, and recurring client activity in one place.",
      "Report previews now expand directly in their cards instead of popping up as a separate window.",
    ],
  },
  {
    version: "v0.2.4",
    date: "August 7, 2026",
    title: "Reports and exports center",
    changes: [
      "Administrators can now preview and download payroll, tips, accounts receivable, and jobs reports from one place.",
      "Reports support a shared date range, and accounts receivable and jobs can be narrowed to a customer area.",
    ],
  },
  {
    version: "v0.2.3",
    date: "August 7, 2026",
    title: "Safer quote scheduling and clearer sales records",
    changes: [
      "Room counts entered while creating a quote now update the customer profile automatically.",
      "Dashboard accepted and booked quote totals now use the date the customer accepted the quote.",
      "Scheduling a quote without a customer signature now requires a staff reason and is clearly recorded on the quote.",
    ],
  },
  {
    version: "v0.2.2",
    date: "August 7, 2026",
    title: "Clearer navigation and calendar notes",
    changes: [
      "The account menu at the bottom of the sidebar now stays available, even in shorter browser windows.",
      "Older customer notes in Calendar now show normal punctuation instead of stray text codes.",
    ],
  },
  {
    version: "v0.2.1",
    date: "August 6, 2026",
    title: "Clearer dashboard reporting",
    changes: [
      "Simplified the Dashboard date filter into one compact control, with quick choices for recent weeks, months, and years plus a custom date range when needed.",
      "Dashboard reporting controls now stay alongside the page heading, with the selected date range always visible and ready to adjust.",
      "Removed duplicate quote numbers and extra create buttons so the Dashboard stays focused on the information that matters.",
      "Today’s schedule is now a full table with the time, customer, cleaning type, location, assigned cleaners, and job status for every visit.",
    ],
  },
  {
    version: "v0.2.0",
    date: "August 6, 2026",
    title: "Operations dashboard refresh",
    changes: [
      "The Dashboard now brings client growth, quote conversion, weekly paid revenue, quote pipeline, and sales performance into one view.",
      "Dashboard insights now call out conversion changes, progress toward the configured revenue target, and sent quotes that have been waiting more than seven days.",
    ],
  },
  {
    version: "v0.1.9",
    date: "August 6, 2026",
    title: "Early access requests are ready",
    changes: [
      "The public Shimmer page is now available to visitors who are not signed in.",
      "Early-access requests now reach the Shimmer team without sending visitors to the login screen.",
    ],
  },
  {
    version: "v0.1.8",
    date: "August 6, 2026",
    title: "Shimmer early access is open",
    changes: [
      "Cleaning-business owners can now learn about Shimmer's scheduling, field, customer, quoting, invoicing, payroll, and visibility tools on a new public page.",
      "Interested owners can request early access with a simple form, without needing to create an account first.",
    ],
  },
  {
    version: "v0.1.7",
    date: "August 6, 2026",
    title: "A refreshed Shimmer look",
    changes: [
      "The login screen now has a cleaner, centered layout with a fresh Shimmer sparkle mark.",
      "The same updated mark now appears in the app navigation and browser tab for a more consistent look.",
    ],
  },
  {
    version: "v0.1.6",
    date: "August 6, 2026",
    title: "Cleaning equipment counts before each stop",
    changes: [
      "Cleaners can now see mop-head, rag, and vacuum counts on My Day before heading to a home.",
      "Administrators can save the real counts on each customer profile; a clearly marked mop-head estimate is shown only when room details are available and no confirmed count has been set.",
    ],
  },
  {
    version: "v0.1.5",
    date: "August 6, 2026",
    title: "Clearer job cancellations and cleaner route prep",
    changes: [
      "Cancelling a job now asks for the reason right in the page or calendar panel, instead of opening a browser popup.",
      "My Day now shows each job's service type, gives cleaners a Job details link before leaving, and keeps next-stop entry instructions and access codes close at hand.",
    ],
  },
  {
    version: "v0.1.4",
    date: "August 6, 2026",
    title: "Secure Square and Maps setup",
    changes: [
      "Administrators can now securely save Square and Google Maps API keys under Settings → Square & Google Maps. Keys are encrypted and are never shown again once saved.",
      "Nothing changes today because no real keys are configured yet: Square remains in its current test mode, and Maps behavior is unchanged.",
    ],
  },
  {
    version: "v0.1.3",
    date: "August 5, 2026",
    title: "Self-service Square and Maps setup",
    changes: [
      "Administrators can now save Square invoicing and Google Maps connection keys in Settings. The saved values are encrypted and are never shown again after saving.",
      "Route maps now remember a customer address after it is first located, reducing repeat Google Maps lookups.",
    ],
  },
  {
    version: "v0.1.2",
    date: "August 4, 2026",
    title: "CleanOps is now Shimmer",
    changes: [
      "CleanOps has a new name: Shimmer. It's the same product and team, with the new branding now throughout the app, including navigation and the login screen.",
      "A complete Privacy Policy is now available in the Legal section, explaining what information we collect, how we use it, and how we protect it.",
    ],
  },
  {
    version: "v0.1.1",
    date: "August 3-4, 2026",
    title: "Customer tools, smoother navigation, and stronger privacy",
    changes: [
      "Improved navigation on phones and mid-size screens: pages stay centered, the menu includes the same items as desktop, and search remains available.",
      "Customers can now be sorted by name or by when they were added.",
      "Customer search now finds phone numbers, with new service-history, cancelled-job, and repeat-customer filters plus a highest-revenue sort.",
      "Quick-cancelling an unassigned job now asks for a cancellation reason first.",
      "Proactively found and closed a privacy gap that could have allowed customer and staff records to be viewed without signing in. All data access now requires proper authorization.",
    ],
  },
  {
    version: "v0.1.0",
    date: "July 30, 2026",
    title: "Field updates and customer-profile polish",
    changes: [
      "House details are easier to scan with compact room and home-information icons.",
      "Service notes now stay compact and omit empty legacy fields.",
      "Customer note fields can be expanded by dragging their lower-right corner.",
      "My Day discard now undoes a clock-in without completing the job.",
      "Admins receive bell notifications when cleaners are on the way, finish work, add close-out information, or upload before/after photos.",
      "Cleaners can record payment methods, check numbers, and damage notes when closing out a job.",
      "Calendar staff boards gained improved daily lanes, cleaner search, property context, and more reliable drag behavior.",
    ],
  },
  {
    version: "v0.0.5",
    date: "July 29, 2026",
    title: "Dispatch, calendar, and team operations",
    changes: [
      "Added a Staff Daily calendar view, employee color coding, column ordering, and a later daily schedule window.",
      "Calendar jobs can open in a quick detail panel with service, price, customer, room, and house information.",
      "Dispatchers can reschedule, change amounts, cancel jobs, assign crews, and set exact start times from the calendar.",
      "The Calendar List view now shows clock status, inline cancellation and rescheduling, and clearer service details.",
      "Admins can also work as field staff, and inactive employees remain available in historical records.",
      "Customer profiles now show upcoming visits with the option to expand the list.",
    ],
  },
  {
    version: "v0.0.4",
    date: "July 27-28, 2026",
    title: "Reliable scheduling and safer administration",
    changes: [
      "Calendar dispatch now supports week and month views, lane rescheduling, undo, conflict warnings, holidays, weekend work, and working-day settings.",
      "Added accessible crew assignment controls, searchable pickers, and improved availability handling.",
      "Jobs, customers, and invoices received faster filtering, pagination, and more accurate operational metrics.",
      "Settings now include clearer payroll tiers, room types, services, quote-template storage, and GHL configuration safeguards.",
      "Login and account security improved with stronger passwords, CAPTCHA support, and administrator password resets.",
      "Schema-drift checks and browser smoke-test coverage were added to help catch production issues before release.",
    ],
  },
  {
    version: "v0.0.3",
    date: "July 24-26, 2026",
    title: "Operations workspace redesign",
    changes: [
      "Rebuilt the Jobs workspace with active, pending, and history views, operational metrics, filters, audit history, and manual time entry.",
      "Reworked Job Detail around customer context, service progress, team coordination, photos, and close-out actions.",
      "Redesigned customer profiles with residential/commercial details, room counts, access instructions, payment status, notes, and cleaner preferences.",
      "Added employee profile photos, account-management improvements, and schedule-agenda views.",
      "Expanded the dashboard with revenue, cash, crew-coverage, date-range, and operations views.",
      "Improved quotes with address-aware pricing, lead handoff, clearer proposal service details, and stronger acceptance safeguards.",
    ],
  },
  {
    version: "v0.0.2",
    date: "July 19-23, 2026",
    title: "Core operations foundation",
    changes: [
      "Introduced the Shimmer design system and refreshed the dashboard, quoting, My Day, and public proposal experiences.",
      "Added employee accounts, self-service password changes, configurable payroll brackets, and multi-cleaner job assignment.",
      "Added TheCustomerFactor customer import and recurring-service backfill support.",
      "Improved navigation speed, search, route previews, customer filters, and date handling.",
      "Added monitoring, deployment configuration, environment checks, backups, and initial automated smoke testing.",
    ],
  },
  {
    version: "v0.0.1",
    date: "July 18, 2026",
    title: "Initial Shimmer build",
    changes: [
      "Launched the first Shimmer operations workspace for customers, jobs, quotes, scheduling, payroll, and field work.",
    ],
  },
];

export default async function HelpCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const company = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const branding = ((
    company?.settings as { branding?: { phone?: string | null } } | null
  )?.branding ?? null) as { phone?: string | null } | null;
  const officePhone = branding?.phone ?? null;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="eyebrow">Support</p>
        <h1 className="page-title mt-2">Help Center</h1>
        <p className="page-subtitle">
          Find help, contact the office, and see what&apos;s new in
          Shimmer.
        </p>
      </div>

      <div className="co-card space-y-4 p-5">
        {officePhone ? (
          <a
            href={`tel:${officePhone}`}
            className="co-button-primary justify-center gap-1.5"
          >
            <Phone className="h-4 w-4" aria-hidden />
            Call the office · {officePhone}
          </a>
        ) : (
          <p className="text-sm text-[var(--co-muted)]">
            No office phone number is on file yet. Contact your administrator.
          </p>
        )}
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For anything urgent while you&apos;re on a job — access issues,
          schedule changes, or a customer question — call the office and someone
          will help right away.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-[var(--co-accent-text)]">
            <Clock3 className="h-5 w-5" aria-hidden />
            <p className="eyebrow text-[var(--co-accent-text)]">
              Product updates
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold">Changelog</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            A plain-language record of new features, improvements, and fixes.
          </p>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {RELEASES.map((release) => (
            <article key={release.version} className="px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--co-accent-fill)] px-2.5 py-1 text-xs font-bold text-white">
                    {release.version}
                  </span>
                  <h3 className="font-semibold">{release.title}</h3>
                </div>
                <time className="text-xs font-medium text-[var(--co-muted)]">
                  {release.date}
                </time>
              </div>
              <ul className="mt-4 space-y-2.5">
                {release.changes.map((change) => (
                  <li
                    key={change}
                    className="flex gap-2.5 text-sm leading-5 text-[var(--co-muted)]"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-success)]"
                      aria-hidden
                    />
                    {change}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <aside className="co-card flex items-start gap-3 p-5">
        <Wrench
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-accent-text)]"
          aria-hidden
        />
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For urgent access issues, schedule changes, or customer questions
          while you&apos;re on a job, call the office for immediate help.
        </p>
      </aside>
    </div>
  );
}
