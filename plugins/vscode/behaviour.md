Given there is no carbonara project currently opened
As a user
In the status bar I see "$(pulse) Carbonara" on the bottom right
When I click on it
Then a menu appears with the title "Select a Carbonara action"
And I see "$(rocket) Initialize Project" with description "Set up Carbonara in this workspace"
And when I click on "$(rocket) Initialize Project"
Then on the top of the editor a dialog "Enter project name" appears
And when I fill the project name and hit enter
Then a dialog "Select project type" appears with options:
  - Web Application
  - Mobile Application  
  - Desktop Application
  - API/Backend Service
  - Other
And when I select a project type
Then the carbonara config for the project is saved on disk
And I see a notification "Carbonara project initialized successfully!"
And the Carbonara project is active in the workspace

In the left sidebar activity bar I see "Carbonara" with a leaf icon
When I click on it
Then I see the Carbonara sidebar with two panels:
  - "CO2 Assessment"
  - "Data & Results"

Given there is a carbonara project in my workspace
As a user  
In the status bar when I click "$(pulse) Carbonara"
I can click on "$(folder-opened) Open Carbonara Project"
And on the top a menu appears with:
  - "🚀 Initialize Carbonara in current workspace"
  - "🔍 Search current workspace for projects" 
  - "📁 Browse for existing config (new window)"
And when I click on "🔍 Search current workspace for projects"
It searches for carbonara.config.json files
And when projects are found, it shows them as "🌱 [Project Name]" with descriptions
And when I click on a project, it opens that project
And I see a notification "Current workspace is already a Carbonara project: [Project Name]"

Given there is no carbonara project in the workspace
And I click on "$(folder-opened) Open Carbonara Project"
And I click on "🔍 Search current workspace for projects"
Then it shows "No Carbonara projects found in current workspace"

Given a carbonara project is open
Then in the left sidebar I can go to "Carbonara"
And I have a panel "CO2 Assessment"
And I have a panel "Data & Results"
On the CO2 Assessment panel
I see assessment sections like:
  - "📊 Project Information" with description "Basic project details"
  - "🏗️ Infrastructure" with description "Hosting and infrastructure details"
And when I click on a section (e.g. "📊 Project Information")
Then the section expands and shows individual questions like:
  - "Expected Users" with status "Not set"
  - "Expected Traffic" with status "Not set"
  - "Target Audience" with status "Not set"
  - "Project Lifespan (months)" with status "Not set"
And when I click on the section header
Then on the top bar dialogs open for each field in sequence:
  - For "Expected Users": Input box with prompt "Expected Users"
  - For "Expected Traffic": Quick pick with options like "Low (< 1K visits/month)", "Medium (1K-10K visits/month)", etc.
  - For "Target Audience": Quick pick with "Local (same city/region)", "National (same country)", "Global (worldwide)"
  - For "Project Lifespan (months)": Input box requiring a number
And when I complete all fields in a section
Then I see a notification "✅ [Section Name] completed!"
And the section status changes to completed
And the field values are shown in the tree (e.g. "Expected Users" shows "1000" instead of "Not set")

As a user
I can click "$(checklist) Run CO2 Assessment" from the status bar menu
And when the assessment is run using the CLI
Then I see progress notification "Running CO2 Assessment..."
And when complete, I see "🎉 CO2 Assessment completed successfully!"

As a user  
I can click "$(globe) Analyze Website" from the status bar menu
And I can enter a URL in the input dialog
And when the website assessment is performed using Greenframe
Then I see in the "Data & Results" panel:
  - A group "🌱 Greenframe Analysis (X)" 
  - Individual analysis entries like "🔬 [URL] - [Date]" with carbon footprint data
And I can expand entries to see detailed carbon analysis results
