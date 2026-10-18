Create a complete mobile student productivity app called **“Deadline Radar”**. The app helps students organize **assignments, projects, quizzes, exams, presentations, and other academic deadlines**.

### DESIGN STYLE

Use a premium **iPhone-inspired Liquid Glass / glassmorphism** design.

* Every screen must be exactly **393 × 852 px**
* Do not create other device sizes
* Portrait mobile layout
* 20 px side margins and an 8 px spacing system
* Frosted glass cards with blur, transparency, subtle borders, reflections, and soft shadows
* Soft background gradient using **light blue, cyan, purple, and white**
* Blue/cyan for primary actions, red for urgent, orange for approaching, green for completed
* Clean Apple-style typography with strong readability
* Rounded cards and buttons, approximately 20–28 px radius
* Use Auto Layout, Components, Variants, and Constraints
* Long content should scroll vertically inside the fixed 393 × 852 frame

### SCREENS

**1. Login**

* Deadline Radar logo
* “Welcome Back!”
* “Stay ahead of every deadline.”
* Student ID / Email
* Password
* Forgot Password?
* Login button
* Continue as Demo Student

**2. Dashboard**

* “Good Morning, Student 👋”
* Profile avatar and notification button
* Summary cards: **Due Today, This Week, Completed, Total Tasks**
* “Today’s Priorities” section
* Deadline cards showing subject, task, due date/time, and priority
* “View All Deadlines” button

Example deadlines:

* Programming — Final Project — Due Today 11:59 PM — High
* Database Management — Assignment 3 — Due Today 5:00 PM — High
* Mathematics — Quiz — Due Tomorrow 9:00 AM — Medium

**3. Deadlines**

* Header: “My Deadlines”
* Search bar
* Filter chips: **All, Today, This Week, Completed**
* Scrollable glass deadline cards
* Add (+) button

**4. Add Deadline**
Create a clean scrollable form with:

* Task Name
* Subject
* Task Type
* Description
* Due Date
* Due Time
* Priority
* Add Deadline button

Task types: Assignment, Project, Quiz, Exam, Presentation, Other.
Priority: Low, Medium, High.

**5. Deadline Details**
Show:

* Subject and task name
* Countdown such as “Due in 6 hours”
* Due date and time
* Task type
* Priority
* Description
* Mark as Complete
* Edit
* Delete

**6. Completion Confirmation**
Create a centered success screen with a large glass checkmark.

Text:
**“Task Completed!”**
“Great job! You completed your Database Assignment.”

Show:

* Completed Today
* Remaining This Week
* Weekly Progress

Add a **Back to Dashboard** button.

**7. Calendar**

* Monthly glass calendar
* Current and selected date
* Indicators for assignments, projects, quizzes, and exams
* Selected-date deadline cards
* Tapping a deadline opens its details

**8. Notifications**

* Notifications header
* Settings button
* Groups: Today, Yesterday, Earlier
* Deadline reminders
* Unread blue/cyan indicator

Example:

* Programming Project due today
* Database Assignment due tomorrow
* Weekly Summary: 3 deadlines this week

**9. Profile**

* Student avatar
* Student name
* Student ID
* Course/Program
* Year Level
* Reminder Settings
* Notification Settings
* Appearance
* Account Settings
* Log Out

### BOTTOM NAVIGATION

Add a floating Liquid Glass navigation bar above the bottom safe area:

**Home | Deadlines | Calendar | Notifications | Profile**

Use simple professional icons and a blue/cyan highlight for the active page.

### UI STATES

Create reusable states for:

* **Loading** — glass skeleton cards and subtle shimmer
* **Empty** — “No Deadlines Yet”, “Nothing Scheduled”, “You’re All Caught Up”
* **Search Empty** — “No Results Found”
* **Error** — “Something Went Wrong” with Try Again
* **Network Error** — “No Internet Connection”
* **Save Error** — “Unable to Save Deadline”
* **Validation Error** — clear messages below invalid fields

Keep all states inside **393 × 852 px** frames.

### PROTOTYPE

Make the main flow interactive:

**Login → Dashboard → Deadlines → Deadline Details → Mark Complete → Completion → Dashboard**

Also connect:

**Dashboard → Add Deadline → Deadline Details**

**Dashboard → Calendar → Deadline Details**

**Dashboard → Notifications → Deadline Details**

**Dashboard → Profile**

Use subtle **Smart Animate, Fade, and Slide** transitions around 200–400 ms.

### FIGMA ORGANIZATION

Organize the file into:

**01 — Design System**
Colors, typography, buttons, inputs, cards, icons, navigation, states

**02 — Authentication**
**03 — Dashboard**
**04 — Deadlines**
**05 — Calendar**
**06 — Notifications**
**07 — Profile**
**08 — Prototype**

Use realistic student content instead of lorem ipsum. Make the final design **premium, clean, modern, intuitive, accessible, interactive, and presentation-ready**.

**IMPORTANT: Every actual screen/frame must be exactly 393 × 852 px. Do not create alternative screen sizes.**
