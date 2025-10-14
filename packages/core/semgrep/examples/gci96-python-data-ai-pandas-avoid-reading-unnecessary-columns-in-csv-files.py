import pandas as pd

file_path = 'data.csv'
# ruleid: gci96-python-data-ai-pandas-avoid-reading-unnecessary-columns-in-csv-files
df1 = pd.read_csv(file_path)

# ruleid: gci96-python-data-ai-pandas-avoid-reading-unnecessary-columns-in-csv-files
df2 = pd.read_csv('data.csv')

# ok: gci96-python-ai-pandas-avoid-reading-unnecessary-columns-in-csv-files
file_path_compliant = 'data.csv'
df_compliant = pd.read_csv(file_path_compliant, usecols=['A', 'B'])
