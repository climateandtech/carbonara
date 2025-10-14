import pandas as pd

file_path = 'data.csv'
# ruleid: gci99-python-data-avoid-csv-format-and-prefer-a-compressed-format-like-parquet
df1 = pd.read_csv(file_path)

# ruleid: gci99-python-data-avoid-csv-format-and-prefer-a-compressed-format-like-parquet
df2 = pd.read_csv('data.csv')

# ok: gci99-python-data-avoid-csv-format-and-prefer-a-compressed-format-like-parquet
file_path_compliant = 'data.parquet'
df_compliant = pd.read_parquet(file_path_compliant)
