# Non-compliant examples
file_path = 'data.csv'
df = pd.read_csv(file_path)
# or
df = pd.read_csv('data.csv')


# Compliant solutions
file_path = 'data.parquet'
df = pd.read_parquet(file_path)
# or
df = pd.read_parquet('data.parquet')
