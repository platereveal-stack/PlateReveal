import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function DetailScreen() {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [commentsList, setCommentsList] = useState([
    { id: '1', author: '@sarah_food', text: 'Incroyable cette recette ! 😍' },
    { id: '2', author: '@chef_marc', text: 'Superbe présentation, bien joué !' }
  ]);

  const handleAddComment = () => {
    // Évite l'ajout de commentaires vides (même avec des espaces)
    if (!comment.trim()) return; 
    
    setCommentsList([...commentsList, { id: Date.now().toString(), author: '@moi', text: comment.trim() }]);
    setComment('');
    Keyboard.dismiss(); // Cache le clavier après l'envoi
  };

  return (
    <KeyboardAvoidingView 
      style={styles.wrapper} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" // Permet de cliquer sur "Envoyer" sans juste fermer le clavier d'abord
      >
        {/* En-tête du plat */}
        <View style={styles.card}>
          <View style={styles.authorRow}>
            <Text style={styles.authorName}>@lucas_cook</Text>
            <Text style={styles.badge}>👨‍🍳 Fait maison</Text>
          </View>

          <View style={styles.imagePlaceholder}>
            <Text style={styles.dishEmoji}>🍝</Text>
            <Text style={styles.dishTitle}>Pâtes Carbonara</Text>
          </View>

          <Text style={styles.recipeTitle}>Recette & Ingrédients :</Text>
          <Text style={styles.recipeText}>
            Spaghetti, guanciale, jaunes d'œufs frais, pecorino romano et poivre noir concassé. Pas de crème !
          </Text>
        </View>

        {/* Section Commentaires */}
        <View style={styles.commentsCard}>
          <Text style={styles.commentsHeader}>Commentaires 💬</Text>
          
          {commentsList.map((item) => (
            <View key={item.id} style={styles.commentItem}>
              <Text style={styles.commentAuthor}>{item.author}</Text>
              <Text style={styles.commentText}>{item.text}</Text>
            </View>
          ))}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor="#64748B"
              value={comment}
              onChangeText={setComment}
              onSubmitEditing={handleAddComment} // Permet d'envoyer avec la touche "Entrée" du clavier
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleAddComment}>
              <Text style={styles.sendText}>Envoyer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bouton Retour */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Retour au fil d'actualité</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, paddingTop: 60, alignItems: 'center' },
  card: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  authorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  authorName: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 16 },
  badge: { backgroundColor: '#0F172A', color: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 12, overflow: 'hidden' },
  imagePlaceholder: { height: 180, borderRadius: 16, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  dishEmoji: { fontSize: 50 },
  dishTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginTop: 6 },
  recipeTitle: { color: '#38BDF8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  recipeText: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  commentsCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  commentsHeader: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
  commentItem: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 8 },
  commentAuthor: { color: '#38BDF8', fontSize: 13, fontWeight: 'bold' },
  commentText: { color: '#CBD5E1', fontSize: 13, marginTop: 2 },
  commentInputRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0F172A', color: '#fff', padding: 12, borderRadius: 12, fontSize: 13 },
  sendBtn: { backgroundColor: '#38BDF8', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12 },
  sendText: { color: '#0F172A', fontWeight: 'bold', fontSize: 13 },
  backBtn: { marginBottom: 30 },
  backText: { color: '#38BDF8', fontSize: 14, fontWeight: '600' },
});